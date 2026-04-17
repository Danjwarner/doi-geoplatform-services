# DOI GeoServices Platform - Implementation Plan

## Executive Summary

A **hybrid Lambda + ECS Fargate architecture** for replacing Carto with a scalable, cost-efficient geospatial platform. Built on TypeScript, PostgreSQL + PostGIS, and AWS managed services.

**Timeline**: 3-4 weeks for MVP, 6-8 weeks for production-ready

**Estimated Cost**:
- Development: ~$150/month
- Production (10M req/day): ~$950/month
- Production (100M req/day): ~$4,500/month

---

## 🎯 Key Architectural Decisions

### 1. ✅ Hybrid Compute Strategy
**Decision**: ECS Fargate for hot path + Lambda for cold path

**Rationale**:
- **ECS advantages**: TRUE connection pooling (20 conn/task), cheaper at scale (> 100 req/s), better for sustained traffic
- **Lambda advantages**: Scales to zero, perfect for bursty/background jobs, simpler deployment
- **Hybrid best of both**: ECS for API/tiles, Lambda for imports/admin

**Hot Path (ECS)**:
- Feature API: 2-50 tasks with 20 DB connections each
- Tile server: 2-20 tasks dedicated to tile generation
- Direct to Aurora (no RDS Proxy overhead)

**Cold Path (Lambda)**:
- Bulk import (S3 triggers)
- Scheduled cleanup
- Admin APIs (low traffic)
- Via RDS Proxy

### 2. ✅ Single-Table Schema with JSONB
**Decision**: Avoid Carto's per-service table pattern

**Schema**:
```sql
CREATE TABLE geo_features (
    id UUID PRIMARY KEY,
    geometry GEOMETRY(Geometry, 4326) NOT NULL,  -- PostGIS
    name TEXT NOT NULL,
    description TEXT,
    properties JSONB DEFAULT '{}',  -- Flexible, queryable
    bureau_id TEXT NOT NULL,        -- Multi-tenancy
    owner_id TEXT NOT NULL,
    owner_type TEXT CHECK (owner_type IN ('user', 'group')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Key indexes
CREATE INDEX idx_geometry ON geo_features USING GIST (geometry);
CREATE INDEX idx_properties ON geo_features USING GIN (properties);
```

**Benefits**:
- No schema sprawl (single normalized table)
- JSONB = flexible properties (like Carto) but queryable
- GIN indexes = fast JSONB queries
- GIST indexes = fast spatial queries

### 3. ✅ Aurora Serverless v2
**Decision**: Aurora Serverless v2 over provisioned RDS

**Configuration**:
- Primary (writes) + Read Replica (tiles)
- 0.5 - 16 ACU auto-scaling
- PostGIS extension
- Multi-AZ for HA

**Cost**: ~$350/month at 4 ACU average (vs ~$200/month provisioned but no auto-scale)

### 4. ✅ Redis Multi-Layer Caching
**Decision**: ElastiCache Redis between services and database

**Cache Layers**:
```
CloudFront (edge) → 1hr TTL for tiles
     ↓
Redis (ElastiCache) → 15min TTL for tiles, 5min for features
     ↓
Aurora PostgreSQL
```

**Impact**: 80%+ cache hit rate = 10-20ms response time (vs 60-100ms DB query)

### 5. ✅ TypeScript Throughout
**Decision**: TypeScript over Python or C#

**Rationale**:
- Team velocity (faster development than C#)
- Type safety (better than Python)
- Single language (API, tiles, Lambda, CDK)
- Good enough performance with Redis caching
- Drizzle ORM = lightweight + PostGIS support

**When we'd reconsider**:
- If DOI mandates .NET (many federal agencies do)
- If performance < 50ms p50 required
- If team is primarily C# (ocio-paws-api is TypeScript, so we're aligned)

### 6. ✅ Drizzle ORM
**Decision**: Drizzle over Prisma/TypeORM

**Rationale**:
- Lightweight (~15KB vs Prisma's 25MB)
- PostGIS support via custom types
- Raw SQL escape hatch (critical for spatial)
- Type-safe query builder
- Good Lambda cold start performance

---

## 📦 Leveraging Existing DOI Infrastructure

### Re-use from `ocio-paws-api`

You already have a **mature Lambda API core library** at `C:/Development/DOI/ocio-paws-api`. We should **absolutely leverage this**:

**What we can re-use:**
```typescript
// From @doi-do/lambda-api-core
import { BaseRepository } from '@doi-do/lambda-api-core/repository';
import { PaginationHelper } from '@doi-do/lambda-api-core/pagination';
import { FilterSortBuilder } from '@doi-do/lambda-api-core/filter-sort';
import { authMiddleware } from '@doi-do/lambda-api-core/middleware';
import { AuditService } from '@doi-do/lambda-api-core/audit';
import { BaseService } from '@doi-do/lambda-api-core/service';
```

**Benefits:**
1. ✅ **Repository pattern** already implemented
2. ✅ **Pagination** (cursor + offset-based) ready
3. ✅ **Filtering/sorting** infrastructure exists
4. ✅ **Middleware** (auth, logging, metrics) proven
5. ✅ **Audit logging** built-in
6. ✅ **RFC 7807 error handling** standardized
7. ✅ **Drizzle ORM experience** (same ORM!)

**What we need to add:**
- PostGIS geometry types in Drizzle schema
- Spatial query extensions to repository
- Redis caching layer (not in PAWS)
- ECS Fargate deployment (PAWS is Lambda-only)
- Tile generation service

**Recommendation**: 
```
doi-geoplatform-services/
├── packages/
│   ├── core/                    # NEW: Geo-specific extensions
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   └── schema.ts    # Drizzle + PostGIS types
│   │   │   ├── repositories/
│   │   │   │   └── geo-feature-repository.ts  # Extends @doi-do BaseRepository
│   │   │   └── cache/
│   │   │       └── redis-manager.ts
│   │   └── package.json         # Depends on @doi-do/lambda-api-core
```

**This will save 2-3 weeks of development time** by not rebuilding auth, pagination, filtering, audit, etc.

---

## 🏗️ Implementation Phases

### Phase 1: MVP (Weeks 1-2)
**Goal**: Basic API with Lambda + RDS Proxy, validate product-market fit

**Deliverables**:
- Lambda CRUD API (using @doi-do/lambda-api-core)
- Aurora PostgreSQL + PostGIS
- RDS Proxy for Lambda connections
- DOI Identity integration (JWT)
- Basic spatial queries (bbox search)

**Infrastructure**:
```
API Gateway → Lambda → RDS Proxy → Aurora
```

**Cost**: ~$150/month
**Traffic capacity**: Up to 1M req/day

### Phase 2: Scale (Weeks 3-4)
**Goal**: Add ECS for hot path, Redis caching, tile server

**Deliverables**:
- ECS Fargate API service (true connection pooling)
- ECS Fargate tile service (MVT tiles)
- ElastiCache Redis (multi-layer caching)
- Lambda bulk import (S3 triggers)
- CloudWatch monitoring

**Infrastructure**:
```
ALB → ECS (API + Tiles)
API Gateway → Lambda (Import/Admin)
Both → Redis → Aurora (Primary + Replica)
```

**Cost**: ~$600/month
**Traffic capacity**: Up to 100M req/day

### Phase 3: Production Hardening (Weeks 5-6)
**Goal**: Monitoring, documentation, performance optimization

**Deliverables**:
- X-Ray tracing
- CloudWatch dashboards + alarms
- Auto-scaling tested under load
- API documentation (OpenAPI)
- Runbook and troubleshooting guide
- Performance benchmarks

### Phase 4: Optional Enhancements (Weeks 7-8+)
**Goal**: Advanced features based on usage patterns

**Possible additions**:
- Multi-region deployment
- Aurora Global Database
- GraphQL API (like PAWS has)
- Python GDAL importer for complex formats
- WMS/WFS endpoints (OGC compliance)
- Tile caching to S3

---

## 📋 Epic Breakdown (Beads Tasks)

All epics have been created in beads with dependencies:

### ✅ Epic 1: Core Infrastructure Setup
**ID**: `danjw-g33d`
**Status**: Ready to start (no dependencies)
**Effort**: 2-3 days

**Tasks**:
- VPC with public/private subnets (3 AZs)
- Aurora Serverless v2 + PostGIS + read replica
- ElastiCache Redis cluster (primary + replica)
- RDS Proxy for Lambda connections
- Secrets Manager for credentials
- S3 buckets (imports, exports, tile-cache)
- Security groups, NAT Gateway

### ✅ Epic 2: Shared Core Package
**ID**: `danjw-qhm8`
**Depends on**: Epic 1
**Effort**: 3-4 days

**Key decision**: **Extend @doi-do/lambda-api-core instead of rebuilding**

**Tasks**:
- Install @doi-do/lambda-api-core as dependency
- Create Drizzle schema with PostGIS types
- Extend BaseRepository with spatial queries
- Build Redis cache manager
- Create Zod schemas for GeoJSON validation
- DOI Identity JWT integration (may already exist in PAWS)

### ✅ Epic 3: ECS API Service (Hot Path)
**ID**: `danjw-yxve`
**Depends on**: Epic 1, Epic 2
**Effort**: 5-6 days

**Tasks**:
- Fastify server with TypeScript
- Feature CRUD endpoints (re-use PAWS patterns)
- Spatial search (bbox, radius)
- Redis caching
- DOI auth middleware
- Dockerfile + ECS deployment
- ALB + auto-scaling (2-50 tasks)
- Integration tests

### ✅ Epic 4: ECS Tile Server (Hot Path)
**ID**: `danjw-b745`
**Depends on**: Epic 1, Epic 2
**Effort**: 4-5 days

**Tasks**:
- PostgreSQL MVT tile function
- Fastify tile server
- `/tiles/{z}/{x}/{y}.mvt` endpoint
- Bureau filtering
- 3-layer caching (Redis → ALB → CloudFront)
- Cache invalidation
- Connect to read replica
- Auto-scaling

### ✅ Epic 5: Lambda Bulk Import Service
**ID**: `danjw-f8a1`
**Depends on**: Epic 1, Epic 2
**Effort**: 3-4 days

**Tasks**:
- S3 event trigger
- GeoJSON parser/validator
- Batch insert (1000 features/txn)
- RDS Proxy connection
- Cache invalidation
- SNS notifications
- Error handling

### ✅ Epic 6: Lambda Admin & Scheduled Tasks
**ID**: `danjw-q7wz`
**Depends on**: Epic 1, Epic 2
**Effort**: 2-3 days

**Tasks**:
- Export Lambda (features → S3)
- Scheduled cleanup (EventBridge)
- Usage analytics
- Admin API Gateway
- Bureau/group management
- CloudWatch dashboard

### ✅ Epic 7: Monitoring & Documentation
**ID**: `danjw-fpk8`
**Depends on**: Epic 3, Epic 4
**Effort**: 2-3 days

**Tasks**:
- X-Ray tracing
- CloudWatch dashboards + alarms
- Structured logging
- OpenAPI documentation
- Architecture diagrams
- Runbook
- Performance benchmarks

---

## 🚀 Getting Started

### Check Available Work
```bash
bd ready
```

### Start with Epic 1 (Infrastructure)
```bash
bd update danjw-g33d -s in_progress
```

### View Epic Details
```bash
bd show danjw-g33d
```

### Check Dependencies
```bash
bd dep tree danjw-g33d
```

---

## 🎯 Success Metrics

### Performance Targets
- **API p50**: < 80ms (with cache: < 20ms)
- **API p95**: < 200ms (with cache: < 50ms)
- **Tile p50**: < 100ms (with cache: < 15ms)
- **Cache hit rate**: > 80%
- **Availability**: 99.9% (8.76 hours downtime/year)

### Cost Targets
- **Development**: < $200/month
- **Production (10M req/day)**: < $1,000/month
- **Production (100M req/day)**: < $5,000/month

### Scale Targets
- **Concurrent requests**: 5,000 req/s sustained
- **Peak traffic**: 10,000 req/s burst
- **Database**: 1B+ features
- **Cold start**: < 500ms (Lambda)

---

## 📚 Key Documentation

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Detailed file organization
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture deep-dive
- [CLAUDE.md](./.claude/CLAUDE.md) - Development workflow (when created)

---

## ⚠️ Risk Mitigation

### Risk 1: Connection Pooling at Scale
**Mitigation**: Start with Lambda + RDS Proxy, graduate to ECS when > 50 req/s

### Risk 2: Tile Performance
**Mitigation**: Multi-layer caching (Redis + CloudFront), read replica for tiles

### Risk 3: Cost Overrun
**Mitigation**: CloudWatch cost alarms, auto-scaling limits, cache-first strategy

### Risk 4: DOI Identity Integration
**Mitigation**: Leverage existing PAWS integration, validate JWT early

### Risk 5: Data Migration from Carto
**Mitigation**: Build bulk import early (Epic 5), test with sample Carto exports

---

## 🤝 Leveraging Existing DOI Assets

### From `ocio-paws-api`:
- ✅ Repository pattern
- ✅ Pagination utilities
- ✅ Filter/sort builder
- ✅ Auth middleware
- ✅ Audit logging
- ✅ Error handling (RFC 7807)
- ✅ Drizzle ORM experience

### From `doi-identity-server`:
- ✅ JWT issuer configuration
- ✅ User/bureau claims structure
- ✅ Authentication flow

### New for GeoServices:
- PostGIS spatial queries
- Vector tile generation
- Redis caching layer
- ECS Fargate deployment
- Hybrid Lambda/ECS pattern

---

## 🎉 Next Steps

1. **Review architecture**: Ensure alignment with DOI standards
2. **Start Epic 1**: Infrastructure setup (VPC, Aurora, Redis)
3. **Install @doi-do/lambda-api-core**: Leverage existing patterns
4. **Validate DOI Identity**: Test JWT integration early
5. **Build incrementally**: Lambda MVP → ECS scale → Production hardening

**Ready to begin? Run:**
```bash
bd update danjw-g33d -s in_progress
```
