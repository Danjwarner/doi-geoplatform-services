# DOI GeoServices Platform - Technical Architecture

## Executive Summary

A hybrid Lambda + ECS architecture for a scalable, cost-efficient geospatial platform replacing Carto. Designed for DOI bureau-level multi-tenancy with flexible schema and high-performance tile serving.

## Core Requirements

1. **Flexible schema**: Core columns (geometry, name, description, id) + JSONB properties
2. **Multi-tenancy**: Bureau-level isolation + user/group ownership
3. **Tile serving**: Vector tiles (MVT) for map visualization
4. **Bulk operations**: Import/export large geospatial datasets
5. **DOI Identity**: Integration with existing DOI identity server
6. **Scale**: Handle 1M-100M requests/day with auto-scaling

## Technology Stack

### Backend
- **Language**: TypeScript (Node.js 20)
- **API Framework**: Fastify (ECS services)
- **ORM**: Drizzle ORM + NetTopologySuite types
- **Database**: Aurora PostgreSQL Serverless v2 + PostGIS
- **Cache**: ElastiCache Redis
- **Compute**: ECS Fargate (hot path) + Lambda (cold path)

### Infrastructure
- **IaC**: AWS CDK (TypeScript)
- **Container Registry**: ECR
- **Secrets**: AWS Secrets Manager
- **Monitoring**: CloudWatch + X-Ray
- **CI/CD**: GitHub Actions

## Database Schema

### Core Table: `geo_features`

```sql
CREATE TABLE geo_features (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core geometry (PostGIS)
    geometry GEOMETRY(Geometry, 4326) NOT NULL,
    
    -- Core attributes
    name TEXT NOT NULL,
    description TEXT,
    
    -- Flexible properties (JSONB - indexed and queryable)
    properties JSONB DEFAULT '{}',
    
    -- Multi-tenancy
    bureau_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'group')),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT NOT NULL,
    updated_by TEXT,
    
    -- Validation
    CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry))
);

-- Indexes
CREATE INDEX idx_geometry ON geo_features USING GIST (geometry);
CREATE INDEX idx_properties ON geo_features USING GIN (properties);
CREATE INDEX idx_bureau ON geo_features (bureau_id);
CREATE INDEX idx_owner ON geo_features (owner_id, owner_type);
CREATE INDEX idx_updated ON geo_features (updated_at DESC);
CREATE INDEX idx_name_search ON geo_features USING GIN (to_tsvector('english', name));

-- Function for vector tiles with bureau filtering
CREATE OR REPLACE FUNCTION geo_features_tiles(
    z integer,
    x integer,
    y integer,
    query_params json DEFAULT '{}'::json
)
RETURNS bytea AS $$
DECLARE
    bureau_filter text;
    mvt_data bytea;
BEGIN
    bureau_filter := query_params->>'bureau_id';
    
    SELECT ST_AsMVT(tile, 'features', 4096, 'geom', 'id') INTO mvt_data
    FROM (
        SELECT
            id,
            name,
            description,
            properties,
            bureau_id,
            ST_AsMVTGeom(
                geometry,
                ST_TileEnvelope(z, x, y),
                4096,
                64,
                true
            ) AS geom
        FROM geo_features
        WHERE geometry && ST_TileEnvelope(z, x, y)
          AND ST_Intersects(geometry, ST_TileEnvelope(z, x, y))
          AND (bureau_filter IS NULL OR bureau_id = bureau_filter)
    ) AS tile
    WHERE geom IS NOT NULL;
    
    RETURN mvt_data;
END;
$$ LANGUAGE plpgsql STABLE PARALLEL SAFE;
```

### Supporting Tables

```sql
-- Bureaus
CREATE TABLE bureaus (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User groups
CREATE TABLE user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bureau_id TEXT NOT NULL REFERENCES bureaus(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group membership
CREATE TABLE group_members (
    group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('member', 'admin')),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
```

## API Architecture

### ECS Fargate API Service (Hot Path)

**Purpose**: High-traffic feature CRUD and spatial queries

**Endpoints**:
```
GET    /features              - List features (paginated, filtered)
GET    /features/:id          - Get feature by ID
POST   /features              - Create feature
PUT    /features/:id          - Update feature
DELETE /features/:id          - Delete feature
POST   /features/search       - Spatial search (bbox, radius)
GET    /features/stats        - Bureau statistics
```

**Connection Pooling**:
```typescript
const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    max: 20,      // 20 connections per ECS task
    min: 5,       // Keep 5 warm
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
});
```

**Auto-scaling**:
- Min tasks: 2
- Max tasks: 50
- Scale on: CPU > 70% OR Requests/task > 1000
- Scale-out cooldown: 60 seconds
- Scale-in cooldown: 300 seconds

### ECS Fargate Tile Service (Hot Path)

**Purpose**: High-performance vector tile generation

**Endpoints**:
```
GET /tiles/{z}/{x}/{y}.mvt   - Vector tile (Mapbox Vector Tile format)
GET /tilejson.json           - TileJSON metadata
```

**Caching Strategy**:
```typescript
// Redis cache key
const cacheKey = `tile:${z}:${x}:${y}:${bureauId}`;

// Cache TTL
const TILE_CACHE_TTL = 900; // 15 minutes

// CloudFront cache (in front of ALB)
Cache-Control: public, max-age=3600  // 1 hour at edge
```

**Performance**:
- Target: < 100ms p95 (with cache)
- Cache hit rate target: > 90%
- Direct to Aurora read replica (no RDS Proxy overhead)

### Lambda Functions (Cold Path)

#### Bulk Import
**Trigger**: S3 upload to `s3://geoservices-imports/`

**Process**:
1. Parse GeoJSON/Shapefile from S3
2. Validate geometries
3. Batch insert (1000 features per transaction)
4. Invalidate affected tile cache
5. Send SNS notification on completion

**Connection**: RDS Proxy (no persistent connection needed)

#### Scheduled Cleanup
**Trigger**: EventBridge (daily at 2 AM)

**Process**:
1. Delete features marked for deletion > 30 days
2. Vacuum analyze database
3. Clear stale cache keys
4. Generate usage report

#### Admin APIs
**Trigger**: API Gateway (low traffic)

**Endpoints**:
```
POST /admin/export             - Export bureau data to S3
GET  /admin/usage              - Usage analytics
POST /admin/bureaus            - Create/update bureau
```

## Authentication & Authorization

### DOI Identity Integration

```typescript
// JWT validation middleware
export async function authenticateRequest(req: FastifyRequest) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        throw new UnauthorizedException('No token provided');
    }
    
    // Validate JWT from DOI Identity Server
    const decoded = await validateDoiJwt(token, {
        issuer: process.env.DOI_IDENTITY_ISSUER,
        audience: 'geoservices-api',
    });
    
    return {
        userId: decoded.sub,
        bureauId: decoded.bureau,
        groups: decoded.groups || [],
        roles: decoded.roles || [],
    };
}

// Authorization checks
export async function authorizeFeatureAccess(
    user: DoiUser,
    featureId: string,
    action: 'read' | 'write' | 'delete'
): Promise<boolean> {
    // Check Redis cache first
    const cacheKey = `auth:${user.userId}:${featureId}:${action}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
        return cached === 'true';
    }
    
    // Query database
    const feature = await db.query(
        'SELECT bureau_id, owner_id, owner_type FROM geo_features WHERE id = $1',
        [featureId]
    );
    
    if (!feature.rows[0]) {
        return false;
    }
    
    const { bureau_id, owner_id, owner_type } = feature.rows[0];
    
    // Authorization logic
    const isAuthorized =
        // Cross-bureau admin
        user.roles.includes('cross_bureau_admin') ||
        // Same bureau
        (bureau_id === user.bureauId && action === 'read') ||
        // Owner (user)
        (owner_type === 'user' && owner_id === user.userId) ||
        // Owner (group member)
        (owner_type === 'group' && user.groups.includes(owner_id));
    
    // Cache result (1 minute)
    await redis.setex(cacheKey, 60, isAuthorized ? 'true' : 'false');
    
    return isAuthorized;
}
```

## Caching Strategy

### Redis Cache Layers

```typescript
interface CacheConfig {
    features: {
        keyPattern: 'feature:{id}',
        ttl: 300,  // 5 minutes
        invalidateOn: ['feature:update', 'feature:delete'],
    },
    featureLists: {
        keyPattern: 'features:{bureau}:{filters}',
        ttl: 60,   // 1 minute
        invalidateOn: ['feature:create', 'feature:update', 'feature:delete'],
    },
    tiles: {
        keyPattern: 'tile:{z}:{x}:{y}:{bureau}',
        ttl: 900,  // 15 minutes
        invalidateOn: ['feature:update:spatial'],
    },
    auth: {
        keyPattern: 'auth:{user}:{feature}:{action}',
        ttl: 60,   // 1 minute
        invalidateOn: ['permission:change', 'feature:owner:change'],
    },
}
```

### Cache Invalidation

```typescript
// On feature update
export async function invalidateCacheForFeature(
    featureId: string,
    oldBounds: BBox,
    newBounds: BBox
) {
    const pipeline = redis.pipeline();
    
    // Invalidate feature cache
    pipeline.del(`feature:${featureId}`);
    
    // Invalidate list caches for bureau
    const feature = await getFeature(featureId);
    pipeline.del(`features:${feature.bureauId}:*`);
    
    // Invalidate affected tiles (zoom levels 10-14)
    const affectedBounds = mergeBounds(oldBounds, newBounds);
    const tiles = getTileRangesForBounds(affectedBounds, [10, 11, 12, 13, 14]);
    
    for (const tile of tiles) {
        pipeline.del(`tile:${tile.z}:${tile.x}:${tile.y}:${feature.bureauId}`);
    }
    
    await pipeline.exec();
}
```

## Monitoring & Observability

### CloudWatch Metrics

**ECS Metrics**:
- `ecs.cpu_utilization`
- `ecs.memory_utilization`
- `ecs.request_count`
- `ecs.target_response_time`

**Lambda Metrics**:
- `lambda.duration`
- `lambda.errors`
- `lambda.concurrent_executions`
- `lambda.throttles`

**Custom Metrics**:
- `api.request_duration_ms` (by endpoint)
- `api.cache_hit_rate` (by cache type)
- `api.db_query_duration_ms` (by query type)
- `tile.generation_duration_ms`
- `tile.cache_hit_rate`
- `auth.authorization_duration_ms`

### CloudWatch Alarms

```typescript
// ECS API high CPU
new cloudwatch.Alarm(this, 'ApiHighCpu', {
    metric: service.metricCpuUtilization(),
    threshold: 80,
    evaluationPeriods: 2,
    alarmDescription: 'API service CPU > 80%',
});

// Tile service slow response
new cloudwatch.Alarm(this, 'TileSlowResponse', {
    metric: tileService.metricTargetResponseTime(),
    threshold: 500, // 500ms
    evaluationPeriods: 3,
    alarmDescription: 'Tile p95 latency > 500ms',
});

// Lambda errors
new cloudwatch.Alarm(this, 'ImportLambdaErrors', {
    metric: importFunction.metricErrors(),
    threshold: 10,
    evaluationPeriods: 1,
    alarmDescription: 'Import lambda error rate high',
});

// Database connections
new cloudwatch.Alarm(this, 'DbHighConnections', {
    metric: cluster.metricDatabaseConnections(),
    threshold: 800,
    evaluationPeriods: 2,
    alarmDescription: 'Aurora connections > 800',
});
```

### X-Ray Tracing

Enable for:
- All Lambda functions
- ECS service (via X-Ray daemon sidecar)
- Track: API calls, DB queries, Redis operations, external calls

## Cost Estimates

### Monthly Cost Breakdown (at 10M requests/day)

| Component | Configuration | Monthly Cost |
|-----------|--------------|--------------|
| **ECS API** | 5 tasks avg (t4g.large equivalent) | $150 |
| **ECS Tiles** | 3 tasks avg (t4g.large equivalent) | $90 |
| **Lambda Import** | 100k invocations × 2s × 512MB | $10 |
| **Lambda Admin** | 10k invocations × 1s × 256MB | $1 |
| **Aurora Serverless v2** | 4 ACU avg × 730hr | $350 |
| **ElastiCache Redis** | cache.r7g.large × 2 (primary + replica) | $180 |
| **ALB** | 10M requests | $20 |
| **Data Transfer** | 1TB egress | $90 |
| **S3** | 100GB storage + requests | $5 |
| **CloudWatch** | Logs + metrics | $50 |
| **Total** | | **~$946/month** |

**Cost per request**: $0.0000946 (~$0.10 per 1,000 requests)

### Cost at Different Scales

| Scale | Monthly Requests | Monthly Cost | Cost/1k req |
|-------|-----------------|--------------|-------------|
| Small | 1M | $150 | $0.15 |
| Medium | 10M | $950 | $0.095 |
| Large | 100M | $4,500 | $0.045 |
| Enterprise | 1B | $35,000 | $0.035 |

## Deployment Strategy

### Environments

1. **Development** (`dev`)
   - Minimal resources (1 ECS task, 0.5 ACU Aurora)
   - Shared by team
   
2. **Staging** (`staging`)
   - Production-like (2 ECS tasks, 2 ACU Aurora)
   - Integration testing
   
3. **Production** (`prod`)
   - Full auto-scaling (2-50 tasks, 0.5-16 ACU)
   - Multi-AZ, backups enabled

### Blue/Green Deployment

ECS services use blue/green via CodeDeploy:
1. Deploy new task definition
2. Gradually shift traffic (10% → 50% → 100%)
3. Monitor metrics during shift
4. Rollback if error rate increases

### Database Migrations

```bash
# Run migrations via Lambda (ephemeral container)
aws lambda invoke \
  --function-name geoservices-migration \
  --payload '{"action": "migrate"}' \
  response.json
```

## Security

### Network Security
- **VPC**: Private subnets for ECS, Aurora, Redis
- **Security Groups**: Least privilege access
- **NAT Gateway**: For ECS → external services

### Data Security
- **Encryption at rest**: Aurora, Redis, S3 (KMS)
- **Encryption in transit**: TLS 1.3 everywhere
- **Secrets**: AWS Secrets Manager (rotated)

### Application Security
- **Input validation**: Zod schemas at API boundary
- **SQL injection**: Parameterized queries (Drizzle ORM)
- **XSS**: Content-Type validation, CSP headers
- **Rate limiting**: API Gateway (Lambda), ALB (ECS)
- **CORS**: Configured per bureau domain

## Disaster Recovery

### Backup Strategy
- **Aurora**: Automated daily snapshots (35-day retention)
- **Point-in-time recovery**: 5-minute granularity
- **Redis**: Daily snapshots (7-day retention)
- **S3**: Versioning enabled, lifecycle policies

### RTO/RPO Targets
- **RTO** (Recovery Time Objective): 1 hour
- **RPO** (Recovery Point Objective): 5 minutes

### Failover Procedures
1. Aurora: Automatic failover to replica (30-120 seconds)
2. Redis: Automatic failover to replica (< 60 seconds)
3. ECS: Multi-AZ deployment, tasks redistributed automatically
4. Lambda: Automatic retry with exponential backoff
