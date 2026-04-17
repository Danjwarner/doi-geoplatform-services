# Documentation

Complete documentation for the DOI GeoServices Platform.

## Getting Started

**New to the project?** Start here:
1. Read the main [README](../README.md) for project overview
2. Read [DEVELOPER.md](./DEVELOPER.md) for setup and development workflow
3. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical architecture

## Documentation Index

### For Developers

- **[DEVELOPER.md](./DEVELOPER.md)** - Complete developer guide
  - Getting started and setup
  - Development workflow
  - Code standards and best practices
  - Testing strategy
  - Common tasks and troubleshooting

- **[DATABASE.md](./DATABASE.md)** - Database management guide
  - Schema documentation
  - Migration workflow
  - Seed data reference
  - PostgreSQL + PostGIS setup
  - Production deployment

### Architecture & Design

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical architecture
  - System design and components
  - Hybrid Lambda + ECS strategy
  - Database design and indexes
  - Caching layers
  - Security and authentication
  - Performance considerations

- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Development roadmap
  - 7 epic breakdown
  - Timeline and milestones
  - Cost estimates
  - Dependencies and risks

- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - File organization
  - Directory structure
  - Package layout
  - Naming conventions

### Progress & History

- **[PROGRESS_SUMMARY.md](./PROGRESS_SUMMARY.md)** - Current status
  - Completed epics
  - Statistics and metrics
  - Next steps

- **[EPIC1_COMPLETE.md](./EPIC1_COMPLETE.md)** - Infrastructure completion
  - VPC, Aurora, Redis, RDS Proxy
  - CDK stacks
  - Cost analysis

- **[EPIC3_COMPLETE.md](./EPIC3_COMPLETE.md)** - API service completion
  - Fastify server
  - Repository layer
  - Spatial queries
  - Migrations and seed data

## Quick Links

### Common Tasks

**Setup development environment:**
→ [DEVELOPER.md - Getting Started](./DEVELOPER.md#getting-started)

**Run database migrations:**
→ [DATABASE.md - Quick Start](./DATABASE.md#quick-start)

**Add new API endpoint:**
→ [DEVELOPER.md - Add New API Endpoint](./DEVELOPER.md#add-new-api-endpoint)

**Deploy infrastructure:**
→ [IMPLEMENTATION_PLAN.md - Deployment](./IMPLEMENTATION_PLAN.md)

### Understanding the System

**How does authentication work?**
→ [ARCHITECTURE.md - Authentication](./ARCHITECTURE.md)

**How are spatial queries performed?**
→ [DATABASE.md - Database Schema](./DATABASE.md#database-schema)

**How does connection pooling work?**
→ [ARCHITECTURE.md - Database](./ARCHITECTURE.md)

**What's the caching strategy?**
→ [ARCHITECTURE.md - Caching](./ARCHITECTURE.md)

## Documentation Standards

### When to Update Documentation

- **Code changes** → Update relevant technical docs
- **New features** → Update DEVELOPER.md and API README
- **Schema changes** → Update DATABASE.md
- **Architecture changes** → Update ARCHITECTURE.md
- **Breaking changes** → Update migration guides
- **Epic completion** → Create EPIC_COMPLETE.md

### Documentation Checklist

When adding new features:
- [ ] Update API endpoint documentation
- [ ] Update DEVELOPER.md if new workflow
- [ ] Update DATABASE.md if schema changed
- [ ] Update .env.example if new config
- [ ] Update troubleshooting section if common issues

### Writing Style

- Use clear, concise language
- Include code examples
- Add "Why" explanations, not just "How"
- Keep tables of contents updated
- Link to related documentation
- Include troubleshooting tips

## External Resources

### Tools & Frameworks
- [Fastify Documentation](https://fastify.dev/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

### DOI Internal
- [DOI Identity Server](https://identity.doi.gov)
- [PAWS API Framework](../../../ocio-paws-api)

---

**Need help?** Check [DEVELOPER.md - Troubleshooting](./DEVELOPER.md#troubleshooting)
