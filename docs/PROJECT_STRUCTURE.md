# DOI GeoServices Platform - Project Structure

```
doi-geoplatform-services/
├── cdk/                                # AWS CDK Infrastructure (TypeScript)
│   ├── bin/
│   │   └── app.ts                     # CDK app entry point
│   ├── lib/
│   │   ├── stacks/
│   │   │   ├── network-stack.ts       # VPC, subnets, security groups
│   │   │   ├── database-stack.ts      # Aurora + PostGIS
│   │   │   ├── cache-stack.ts         # ElastiCache Redis
│   │   │   ├── ecs-api-stack.ts       # ECS Fargate API service
│   │   │   ├── ecs-tile-stack.ts      # ECS Fargate tile service
│   │   │   ├── lambda-stack.ts        # Lambda functions
│   │   │   └── monitoring-stack.ts    # CloudWatch, X-Ray
│   │   └── constructs/
│   │       ├── ecs-service.ts         # Reusable ECS service construct
│   │       └── lambda-function.ts     # Reusable Lambda construct
│   ├── package.json
│   └── tsconfig.json
│
├── packages/
│   ├── core/                          # Shared TypeScript library
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts          # Drizzle ORM schema
│   │   │   │   ├── connection.ts      # DB connection pooling
│   │   │   │   └── migrations/        # SQL migrations
│   │   │   ├── models/
│   │   │   │   ├── geo-feature.ts     # GeoFeature type
│   │   │   │   ├── user.ts            # User type
│   │   │   │   └── bureau.ts          # Bureau type
│   │   │   ├── repositories/
│   │   │   │   ├── geo-feature-repository.ts
│   │   │   │   └── bureau-repository.ts
│   │   │   ├── auth/
│   │   │   │   ├── doi-identity.ts    # DOI identity integration
│   │   │   │   ├── jwt-validator.ts   # JWT validation
│   │   │   │   └── authorization.ts   # Bureau/owner checks
│   │   │   ├── cache/
│   │   │   │   ├── redis-client.ts    # Redis connection
│   │   │   │   └── cache-manager.ts   # Cache strategies
│   │   │   ├── validation/
│   │   │   │   └── schemas.ts         # Zod schemas
│   │   │   └── utils/
│   │   │       ├── geometry.ts        # GeoJSON helpers
│   │   │       └── logger.ts          # Structured logging
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── api/                           # ECS Fargate API Service
│   │   ├── src/
│   │   │   ├── server.ts              # Fastify server entry
│   │   │   ├── routes/
│   │   │   │   ├── features.ts        # Feature CRUD
│   │   │   │   ├── search.ts          # Spatial search
│   │   │   │   ├── metadata.ts        # Bureau/stats APIs
│   │   │   │   └── health.ts          # Health check
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts            # JWT authentication
│   │   │   │   ├── error-handler.ts   # Global error handling
│   │   │   │   └── request-logger.ts  # Request logging
│   │   │   └── plugins/
│   │   │       ├── db.ts              # DB plugin
│   │   │       └── redis.ts           # Redis plugin
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── tile-server/                   # ECS Fargate Tile Service
│   │   ├── src/
│   │   │   ├── server.ts              # Fastify server
│   │   │   ├── routes/
│   │   │   │   └── tiles.ts           # MVT tile endpoints
│   │   │   ├── services/
│   │   │   │   ├── tile-generator.ts  # PostGIS → MVT
│   │   │   │   └── tile-cache.ts      # Redis caching
│   │   │   └── middleware/
│   │   │       └── auth.ts            # Bureau filtering
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── lambda-import/                 # Bulk import Lambda
│   │   ├── src/
│   │   │   ├── handlers/
│   │   │   │   ├── s3-trigger.ts      # S3 event handler
│   │   │   │   └── import-geojson.ts  # GeoJSON processor
│   │   │   └── services/
│   │   │       └── bulk-insert.ts     # Batch DB insert
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── lambda-admin/                  # Admin Lambda functions
│   │   ├── src/
│   │   │   ├── handlers/
│   │   │   │   ├── cleanup.ts         # Scheduled cleanup
│   │   │   │   ├── export.ts          # Export to S3
│   │   │   │   └── analytics.ts       # Usage analytics
│   │   │   └── services/
│   │   │       └── report-generator.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── python-importer/               # Python GDAL importer (optional)
│       ├── src/
│       │   ├── handlers/
│       │   │   └── shapefile_import.py
│       │   └── services/
│       │       └── gdal_processor.py
│       ├── Dockerfile
│       └── requirements.txt
│
├── scripts/                           # Development scripts
│   ├── setup-db.sh                    # Local PostgreSQL + PostGIS
│   ├── seed-data.sh                   # Sample data
│   └── deploy.sh                      # Deployment script
│
├── docs/                              # Documentation
│   ├── architecture/
│   │   ├── decisions/                 # ADRs
│   │   └── diagrams/
│   ├── api/
│   │   └── openapi.yaml              # API spec
│   └── deployment/
│       └── runbook.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml                     # PR validation
│       └── deploy.yml                 # Deployment pipeline
│
├── docker-compose.yml                 # Local development
├── package.json                       # Root workspace
├── tsconfig.json                      # Root TypeScript config
└── README.md
```

## Key Design Decisions

### 1. Monorepo Structure
- **Shared code** in `packages/core` (DB, auth, validation)
- **ECS services** in separate packages (independent deployment)
- **Lambda functions** in separate packages (independent deployment)

### 2. TypeScript Throughout
- API, tile server, Lambda all TypeScript
- Shared types from `core` package
- Python only for GDAL-heavy imports (optional)

### 3. Infrastructure as Code
- AWS CDK in TypeScript (same language as app)
- Modular stacks (network, DB, ECS, Lambda separate)
- Reusable constructs

### 4. Hybrid Compute
- **ECS Fargate**: Hot path (feature API, tiles)
- **Lambda**: Cold path (imports, admin, scheduled)

### 5. Connection Strategy
- **ECS**: Direct to Aurora (true pooling, 20 conn/task)
- **Lambda**: RDS Proxy (connection multiplexing)

### 6. Caching Strategy
- **Redis**: Shared between ECS and Lambda
- **Cache keys**: Namespaced by type (feature, tile, auth, list)
- **Invalidation**: On write operations
