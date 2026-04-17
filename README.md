# DOI GeoServices Platform

A modern, scalable geospatial API platform built with hybrid Lambda + ECS Fargate architecture, replacing Carto for the Department of Interior.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22+ and npm 10+
- **AWS CLI** configured with appropriate credentials
- **AWS CDK** 2.170+ (`npm install -g aws-cdk`)
- **Docker** (for local development and ECS deployments)
- **PostgreSQL 14+** with PostGIS (for local development)

### Installation

```bash
# Clone repository
git clone https://github.com/doi/doi-geoplatform-services.git
cd doi-geoplatform-services

# Install dependencies
npm install

# Bootstrap CDK (first time only, per account/region)
cd cdk
npx cdk bootstrap --context stage=dev

# Deploy infrastructure (Epic 1 - Network, Database, Cache)
npx cdk deploy --all --context stage=dev
```

## 📋 Project Status

**Current Epic:** Epic 1 - Core Infrastructure Setup (IN PROGRESS)

### Completed
- ✅ Project structure
- ✅ CDK infrastructure setup
  - ✅ Network stack (VPC, subnets, security groups)
  - ✅ Database stack (Aurora Serverless v2 + PostGIS)
  - ✅ Cache stack (ElastiCache Redis)

### In Progress
- 🔄 Epic 1: Deploying core infrastructure

### Coming Next
- ⏳ Epic 2: Shared core package (Drizzle ORM, auth, caching)
- ⏳ Epic 3: ECS API service
- ⏳ Epic 4: ECS tile server
- ⏳ Epic 5: Lambda bulk import
- ⏳ Epic 6: Lambda admin & scheduled tasks
- ⏳ Epic 7: Monitoring & documentation

**Track progress:**
```bash
bd show danjw-g33d  # View Epic 1 details
bd ready            # See all available tasks
```

## 🏗️ Architecture

### Hybrid Compute Strategy

```
┌─ Hot Path (ECS Fargate) ─────────────┐
│ • Feature API (2-50 tasks)           │
│ • Tile Server (2-20 tasks)           │
│ • TRUE connection pooling (20/task)  │
└──────────────────────────────────────┘

┌─ Cold Path (Lambda) ─────────────────┐
│ • Bulk Import (S3 triggers)          │
│ • Scheduled Tasks                    │
│ • Admin APIs                         │
└──────────────────────────────────────┘

┌─ Shared Infrastructure ──────────────┐
│ • Aurora Serverless v2 + PostGIS     │
│ • ElastiCache Redis                  │
│ • DOI Identity (JWT)                 │
└──────────────────────────────────────┘
```

**Key Decisions:**
- **Database:** Single table schema + JSONB (no Carto's table-per-service sprawl)
- **Caching:** Multi-layer (Redis → ALB → CloudFront)
- **Auth:** DOI Identity Server (JWT) with bureau + ownership model
- **ORM:** Drizzle (lightweight, PostGIS-friendly)

**See:** [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical design

## 📦 Project Structure

```
doi-geoplatform-services/
├── cdk/                      # AWS CDK infrastructure
│   ├── lib/stacks/
│   │   ├── network-stack.ts  # ✅ VPC, subnets, security groups
│   │   ├── database-stack.ts # ✅ Aurora + PostGIS + RDS Proxy
│   │   └── cache-stack.ts    # ✅ ElastiCache Redis
│   └── bin/app.ts            # ✅ CDK app entry point
│
├── packages/                 # Application packages (Coming in Epic 2+)
│   ├── core/                 # Shared library (DB, auth, cache)
│   ├── api/                  # ECS Fargate API service
│   ├── tile-server/          # ECS Fargate tile service
│   ├── lambda-import/        # Bulk import Lambda
│   └── lambda-admin/         # Admin Lambdas
│
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md       # Technical architecture
│   ├── IMPLEMENTATION_PLAN.md # Phase-by-phase plan
│   └── PROJECT_STRUCTURE.md  # Detailed file organization
│
└── README.md                 # This file
```

## 🛠️ Development

### Local Development (Coming in Epic 2)

```bash
# Install dependencies
npm install

# Start local PostgreSQL + PostGIS (Docker)
docker-compose up -d postgres redis

# Run database migrations
npm run migrate

# Start API server (local)
npm run dev --workspace=packages/api

# Run tests
npm test
```

### CDK Deployment

```bash
cd cdk

# Synthesize CloudFormation templates
npx cdk synth --context stage=dev

# View what will be deployed
npx cdk diff --all --context stage=dev

# Deploy all stacks
npx cdk deploy --all --context stage=dev

# Deploy specific stack
npx cdk deploy GeoServices-Database-dev --context stage=dev

# Destroy all resources (careful!)
npx cdk destroy --all --context stage=dev
```

### Stages

- **dev**: Development environment (minimal resources, ~$150/month)
- **staging**: Staging environment (production-like, ~$600/month)
- **prod**: Production environment (full HA, auto-scaling, ~$950/month at 10M req/day)

## 🔐 Configuration

### Environment Variables (Coming in Epic 2)

Create `.env.local`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/geoservices

# Redis
REDIS_URL=redis://localhost:6379

# DOI Identity
DOI_IDENTITY_ISSUER=https://identity.doi.gov
DOI_IDENTITY_AUDIENCE=geoservices-api

# AWS (for local development with LocalStack)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
```

### CDK Context

Override defaults in `cdk/cdk.context.json`:

```json
{
  "stage": "dev",
  "account": "123456789012",
  "region": "us-east-1"
}
```

## 📊 Cost Estimates

| Stage | Monthly Requests | Monthly Cost | Components |
|-------|------------------|--------------|------------|
| **Dev** | 1M | ~$150 | Minimal resources, 1 NAT GW |
| **Staging** | 10M | ~$600 | 2 ECS tasks, 1 NAT GW |
| **Prod** | 10M | ~$950 | Auto-scaling, 3 NAT GWs, HA |
| **Prod** | 100M | ~$4,500 | Full scale |

**Breakdown (10M req/day prod):**
- ECS: $240 (API + Tiles)
- Lambda: $11 (Import + Admin)
- Aurora: $350 (4 ACU avg)
- Redis: $180 (r7g.large × 2)
- Data Transfer: $90
- Other: $79 (ALB, S3, CloudWatch)

## 🧪 Testing (Coming in Epic 2+)

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific package tests
npm test --workspace=packages/core

# Integration tests (requires test database)
npm run test:integration
```

## 📚 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete technical architecture
- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Epic breakdown, timeline, cost estimates
- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - Detailed file organization

## 🤝 Leveraging Existing DOI Assets

This project extends [`@doi-do/lambda-api-core`](C:/Development/DOI/ocio-paws-api) from the PAWS API:

**Re-used components:**
- ✅ Repository pattern
- ✅ Pagination utilities
- ✅ Filter/sort builder
- ✅ Auth middleware
- ✅ Audit logging
- ✅ RFC 7807 error handling

**New for GeoServices:**
- PostGIS spatial queries
- Vector tile generation
- Redis caching layer
- ECS Fargate deployment

## 📈 Monitoring (Coming in Epic 7)

**CloudWatch Dashboards:**
- API performance (latency, throughput, errors)
- Tile performance (generation time, cache hit rate)
- Database metrics (connections, ACU, query time)
- Cache metrics (hit rate, memory, evictions)

**Alarms:**
- High API latency (p95 > 200ms)
- High error rate (> 1%)
- High database connections (> 800)
- High cache evictions

## 🚨 Troubleshooting

### CDK Deployment Issues

**Bootstrap required:**
```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION --context stage=dev
```

**Permission errors:**
Ensure your AWS credentials have sufficient permissions:
- VPC, EC2 (for network)
- RDS, Secrets Manager (for database)
- ElastiCache (for cache)
- CloudFormation, IAM (for CDK)

### Database Connection Issues (Coming in Epic 2+)

**Check security groups:**
```bash
aws ec2 describe-security-groups --group-ids sg-xxxxx
```

**Test connection:**
```bash
psql -h cluster-endpoint.rds.amazonaws.com -U postgres -d geoservices
```

## 🎯 Next Steps

1. **Deploy Epic 1 infrastructure:**
   ```bash
   cd cdk
   npx cdk deploy --all --context stage=dev
   ```

2. **Verify resources:**
   ```bash
   # Check Aurora cluster
   aws rds describe-db-clusters --db-cluster-identifier geoservices-dev
   
   # Check Redis cluster
   aws elasticache describe-replication-groups --replication-group-id geoservices-dev
   ```

3. **Start Epic 2 (Shared Core Package):**
   ```bash
   bd update danjw-qhm8 -s in_progress
   ```

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

## 👥 Contributors

- DOI Digital Operations Team
- Built with guidance from architectural evaluation framework

---

**Questions or issues?** Check the [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) or contact the team.
