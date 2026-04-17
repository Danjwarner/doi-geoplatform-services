# DOI GeoServices Platform - Documentation Index

Complete documentation organized by topic and audience.

## 📖 By Audience

### 👨‍💻 Developers (Start Here)
1. **[DEVELOPER.md](./DEVELOPER.md)** - Your primary resource
   - Setup and installation
   - Daily workflow
   - Code standards
   - Common tasks
   - Troubleshooting

2. **[DATABASE.md](./DATABASE.md)** - Database operations
   - Migrations
   - Seed data
   - Schema management

### 🏗️ Architects
1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design
   - Technical decisions
   - Component architecture
   - Performance considerations

2. **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Roadmap
   - Epic breakdown
   - Timeline
   - Cost estimates

### 📊 Project Managers
1. **[PROGRESS_SUMMARY.md](./PROGRESS_SUMMARY.md)** - Current status
   - Completed work
   - Statistics
   - Next steps

2. **[Epic Completion Documents](#epic-summaries)** - Deliverables

## 📚 By Topic

### Getting Started
- [Setup Environment](./DEVELOPER.md#getting-started)
- [Run First Migration](./DATABASE.md#quick-start)
- [Start Dev Server](./DEVELOPER.md#development-workflow)
- [Project Overview](../README.md)

### Development
- [Code Standards](./DEVELOPER.md#code-standards)
- [Testing Strategy](./DEVELOPER.md#testing)
- [Git Workflow](./DEVELOPER.md#contributing)
- [Common Tasks](./DEVELOPER.md#common-tasks)

### Database
- [Schema Design](./DATABASE.md#database-schema)
- [Migration Workflow](./DATABASE.md#database-commands-reference)
- [Seed Data](./DATABASE.md#seed-data)
- [PostGIS Setup](./DATABASE.md#postgis-extension)

### Architecture
- [System Components](./ARCHITECTURE.md)
- [Hybrid Lambda + ECS](./ARCHITECTURE.md)
- [Connection Pooling](./ARCHITECTURE.md)
- [Caching Strategy](./ARCHITECTURE.md)
- [Security Model](./ARCHITECTURE.md)

### Deployment
- [Infrastructure (CDK)](./EPIC1_COMPLETE.md)
- [API Service (ECS)](./EPIC3_COMPLETE.md)
- [Production Strategy](./DATABASE.md#production-deployment)

### Reference
- [Project Structure](./PROJECT_STRUCTURE.md)
- [API Endpoints](../packages/api/README.md)
- [Environment Variables](../packages/api/.env.example)

## 📋 Epic Summaries

Track completed work by epic:

- **[EPIC1_COMPLETE.md](./EPIC1_COMPLETE.md)** - Infrastructure (VPC, Aurora, Redis)
- **[EPIC3_COMPLETE.md](./EPIC3_COMPLETE.md)** - API Service (Fastify, PostGIS, Migrations)

**In Progress:**
- Epic 4: Tile Server (Vector tiles, MVT)
- Epic 5: Bulk Import (Lambda, S3)
- Epic 6: Admin Tasks (Scheduled jobs)
- Epic 7: Monitoring (CloudWatch, X-Ray)

## 🔍 Quick Reference

### Commands

```bash
# Development
pnpm dev                    # Start dev server
pnpm typecheck             # Check types
pnpm test                  # Run tests

# Database
pnpm db:generate           # Generate migration
pnpm db:migrate            # Run migrations
pnpm db:seed              # Seed data
pnpm db:studio            # Drizzle Studio

# Infrastructure
npm run synth             # Synthesize CDK
npm run deploy            # Deploy to AWS
```

### File Locations

```
Root
├── README.md                      # Project overview
├── docs/                          # All documentation
│   ├── README.md                  # This index
│   ├── DEVELOPER.md              # Developer guide
│   ├── DATABASE.md               # Database guide
│   ├── ARCHITECTURE.md           # Architecture
│   └── ...
├── packages/
│   ├── api/README.md             # API documentation
│   └── core/                     # Shared utilities
└── cdk/                          # Infrastructure
```

### Key Decisions

**Why single table design?**
→ [ARCHITECTURE.md - Database Design](./ARCHITECTURE.md)

**Why hybrid Lambda + ECS?**
→ [ARCHITECTURE.md - Compute Strategy](./ARCHITECTURE.md)

**Why PostGIS?**
→ [DATABASE.md - PostGIS Extension](./DATABASE.md#postgis-extension)

**Why Drizzle ORM?**
→ [IMPLEMENTATION_PLAN.md - Technology Choices](./IMPLEMENTATION_PLAN.md)

## 🎯 Documentation Goals

### Completeness
Every feature, API, and component is documented with:
- Purpose and rationale
- Usage examples
- Configuration options
- Troubleshooting tips

### Accuracy
Documentation is updated with:
- Code changes
- Architecture decisions
- Breaking changes
- New features

### Accessibility
Documentation is organized for:
- Quick reference (common tasks)
- Deep dives (architecture)
- Tutorials (getting started)
- Troubleshooting (problems)

## 📊 Statistics

**Documentation Files:** 9  
**Total Lines:** ~12,000  
**Code Comments:** Inline where needed  
**API Endpoints Documented:** 10+  
**Common Tasks Covered:** 20+

## 🔄 Recent Updates

**2026-04-17:**
- ✅ Created DEVELOPER.md (comprehensive developer guide)
- ✅ Created DATABASE.md (database management)
- ✅ Created EPIC3_COMPLETE.md (API service completion)
- ✅ Moved all docs to docs/ folder
- ✅ Created docs/README.md navigation guide

**2026-04-17 (Earlier):**
- ✅ Created ARCHITECTURE.md
- ✅ Created IMPLEMENTATION_PLAN.md
- ✅ Created EPIC1_COMPLETE.md

## 🤝 Contributing to Documentation

### When to Update

- **New feature** → Update relevant docs + API README
- **Schema change** → Update DATABASE.md
- **Architecture change** → Update ARCHITECTURE.md + add decision record
- **Breaking change** → Update migration guide + CHANGELOG
- **Bug fix with lessons** → Update troubleshooting section

### How to Update

1. Edit the relevant markdown file
2. Follow the existing structure and style
3. Add code examples for clarity
4. Update tables of contents
5. Cross-reference related docs
6. Test all links

### Documentation Standards

- Use clear, concise language
- Code examples with comments
- Explain "why" not just "how"
- Include troubleshooting
- Keep formatting consistent
- Update index if needed

## 📞 Getting Help

**Can't find what you need?**
1. Check [DEVELOPER.md - Troubleshooting](./DEVELOPER.md#troubleshooting)
2. Search docs folder for keywords
3. Check GitHub issues
4. Ask in team chat

**Found an error in docs?**
1. Create GitHub issue
2. Or submit PR with fix
3. Tag with "documentation"

---

**Last Updated:** 2026-04-17  
**Documentation Version:** 1.0  
**Project Status:** Epic 3 Complete (43%)
