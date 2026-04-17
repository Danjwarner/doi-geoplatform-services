# Developer Guide

Complete guide for developers working on the DOI GeoServices Platform.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Development Workflow](#development-workflow)
4. [Code Standards](#code-standards)
5. [Testing](#testing)
6. [Database Management](#database-management)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)
9. [Architecture](#architecture)
10. [Contributing](#contributing)

---

## Getting Started

### Prerequisites

**Required:**
- Node.js 22+ (use nvm: `nvm use 22`)
- pnpm 10+ (`npm install -g pnpm`)
- PostgreSQL 15+ with PostGIS
- Git

**Recommended:**
- Docker Desktop (for local testing)
- VS Code with extensions:
  - ESLint
  - Prettier
  - TypeScript + JavaScript Language Features
  - Drizzle Kit

### Initial Setup

```bash
# 1. Clone repository
git clone <repository-url>
cd doi-geoplatform-services

# 2. Install dependencies (uses pnpm workspaces)
pnpm install

# 3. Set up environment variables
cd packages/api
cp .env.example .env
# Edit .env with your database credentials

# 4. Start PostgreSQL with PostGIS
docker run -d \
  --name geoservices-postgres \
  -e POSTGRES_DB=geoservices \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgis/postgis:15-3.3

# 5. Run migrations and seed data
pnpm db:migrate:seed

# 6. Start development server
pnpm dev

# API available at http://localhost:3000
```

### Verify Setup

```bash
# Test database connection
curl http://localhost:3000/health/ready

# Test API endpoint
curl http://localhost:3000/api/v1/features

# Check logs for any errors
```

---

## Project Structure

```
doi-geoplatform-services/
├── cdk/                              # AWS CDK infrastructure
│   ├── bin/
│   │   └── app.ts                    # CDK app entry point
│   └── lib/
│       └── stacks/
│           └── infrastructure-stack.ts  # VPC, Aurora, Redis
│
├── packages/
│   ├── core/                         # Shared utilities
│   │   └── src/
│   │       ├── auth/                 # DOI Identity JWT
│   │       ├── cache/                # Cache manager
│   │       ├── models/               # TypeScript types
│   │       ├── utils/                # Logging, geometry
│   │       └── validation/           # Zod schemas
│   │
│   └── api/                          # Fastify API service
│       ├── src/
│       │   ├── db/
│       │   │   ├── schema.ts         # Drizzle schema
│       │   │   ├── connection.ts     # Connection pooling
│       │   │   ├── migrate.ts        # Migration runner
│       │   │   └── seed.ts           # Seed data
│       │   ├── middleware/
│       │   │   ├── auth.ts           # JWT validation
│       │   │   ├── error-handler.ts  # Global errors
│       │   │   └── logging.ts        # Request logging
│       │   ├── repositories/
│       │   │   └── geo-feature-repository.ts  # DB queries
│       │   ├── routes/
│       │   │   ├── features.ts       # Feature CRUD + search
│       │   │   └── health.ts         # Health checks
│       │   └── server.ts             # Fastify setup
│       ├── drizzle/                  # Generated migrations
│       ├── Dockerfile                # Container image
│       └── drizzle.config.ts         # Drizzle Kit config
│
├── scripts/
│   └── deploy.sh                     # CDK deployment helper
│
├── ARCHITECTURE.md                   # Technical architecture
├── IMPLEMENTATION_PLAN.md            # Development roadmap
├── DATABASE.md                       # Database documentation
├── DEVELOPER.md                      # This file
└── README.md                         # Project overview
```

### Package Organization

**Monorepo:** Uses pnpm workspaces for package management.

**Core Package (`@doi/geoservices-core`):**
- Shared utilities used by API and future services
- No dependencies on API package
- Exports: auth, cache, models, utils, validation

**API Package (`@doi/geoservices-api`):**
- Fastify HTTP API service
- Depends on core package
- Includes database schema and migrations

**CDK Package:**
- Infrastructure as Code
- Separate from application code
- No runtime dependencies

---

## Development Workflow

### Daily Development

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install dependencies (if package.json changed)
pnpm install

# 3. Start dev server with hot reload
cd packages/api
pnpm dev

# 4. Make changes, server auto-reloads
# 5. Run type check
pnpm typecheck

# 6. Commit changes
git add .
git commit -m "feat: add feature name"
git push
```

### Working with Database

```bash
# Generate migration after schema changes
pnpm db:generate

# Review generated SQL in drizzle/ folder

# Apply migration to database
pnpm db:migrate

# Seed fresh data
pnpm db:seed

# Open Drizzle Studio (web UI)
pnpm db:studio
```

### Hot Reload

The dev server uses `tsx watch` for instant reloads:
- Changes to `.ts` files auto-reload
- Database connection pool is recreated
- No need to restart manually

### Package Scripts

**Core Package:**
```bash
pnpm build          # Compile TypeScript
pnpm watch          # Watch mode compilation
pnpm typecheck      # Type check only
pnpm test           # Run tests (future)
```

**API Package:**
```bash
pnpm dev            # Dev server with hot reload
pnpm build          # Production build
pnpm start          # Start production server
pnpm typecheck      # Type check
pnpm db:generate    # Generate migration
pnpm db:migrate     # Run migrations
pnpm db:seed        # Seed database
pnpm db:studio      # Drizzle Studio
```

**CDK:**
```bash
npm run synth       # Synthesize CloudFormation
npm run diff        # Compare with deployed
npm run deploy      # Deploy to AWS
```

---

## Code Standards

### TypeScript

**Strict Mode:** Enabled in all packages.

**Naming Conventions:**
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Interfaces: `PascalCase` (no `I` prefix)
- Types: `PascalCase`

**Example:**
```typescript
// Good
export class GeoFeatureRepository {
  async findById(id: string): Promise<GeoFeature | undefined> {
    const CACHE_KEY = `feature:${id}`;
    // ...
  }
}

// Bad
export class geo_feature_repository {
  async FindByID(ID: string): Promise<IGeoFeature | undefined> {
    // ...
  }
}
```

### Code Organization

**One export per file rule:**
- Exception: Types/interfaces related to main export

**File structure:**
```typescript
// 1. Imports (external, then internal)
import { FastifyInstance } from 'fastify';
import { getLogger } from '@doi/geoservices-core/utils';

// 2. Types/Interfaces
interface RouteOptions {
  // ...
}

// 3. Constants
const DEFAULT_PAGE_SIZE = 50;

// 4. Main export
export async function featureRoutes(fastify: FastifyInstance) {
  // ...
}

// 5. Helper functions (not exported)
function validateInput(data: unknown) {
  // ...
}
```

### Import Paths

**Use .js extension** for local imports (ESM requirement):
```typescript
// Good
import { schema } from './db/schema.js';

// Bad
import { schema } from './db/schema';
```

**Package imports:**
```typescript
// Good
import { getLogger } from '@doi/geoservices-core/utils';

// Bad
import { getLogger } from '../../core/src/utils/logger';
```

### Error Handling

**Use custom error classes:**
```typescript
import { NotFoundError, ForbiddenError } from './middleware/error-handler.js';

// Throw semantic errors
if (!feature) {
  throw new NotFoundError(`Feature ${id} not found`);
}

if (!canAccess(user, feature)) {
  throw new ForbiddenError('Cannot access this feature');
}
```

**Don't swallow errors:**
```typescript
// Bad
try {
  await dangerousOperation();
} catch (error) {
  // Silent failure
}

// Good
try {
  await dangerousOperation();
} catch (error) {
  logger.error({ error }, 'Operation failed');
  throw error;
}
```

### Logging

**Use structured logging:**
```typescript
import { getLogger } from '@doi/geoservices-core/utils';

const logger = getLogger('module-name');

// Good
logger.info(
  {
    featureId: feature.id,
    userId: user.userId,
    bureauId: feature.bureauId,
  },
  'Feature created'
);

// Bad
logger.info(`Feature ${feature.id} created by ${user.userId}`);
```

**Log Levels:**
- `trace` - Very detailed debugging
- `debug` - Debug information
- `info` - Normal operations
- `warn` - Warning conditions
- `error` - Error conditions
- `fatal` - Fatal errors (app crash)

### Comments

**When to comment:**
- Complex algorithms
- Business logic rationale
- TODO/FIXME with context
- API/public function docs

**When NOT to comment:**
- Obvious code
- Restating what code does
- Commented-out code (use git)

```typescript
// Good
/**
 * Calculate tile range for cache invalidation.
 * 
 * Limits to 100 tiles per zoom level to prevent cache explosion
 * when features span large areas.
 */
function getTileRange(bounds: BoundingBox, zooms: number[]): Tile[] {
  // ...
}

// Bad
// Get tiles
function getTiles(b, z) {
  // Loop through zooms
  for (let zoom of z) {
    // Do stuff
  }
}
```

### Async/Await

**Always use async/await** (no raw promises):
```typescript
// Good
async function fetchFeature(id: string) {
  const feature = await repository.findById(id);
  return feature;
}

// Bad
function fetchFeature(id: string) {
  return repository.findById(id).then(feature => {
    return feature;
  });
}
```

### Type Safety

**Avoid `any`** (use `unknown` if truly unknown):
```typescript
// Good
function processData(data: unknown) {
  if (typeof data === 'object' && data !== null) {
    // Type guard
  }
}

// Bad
function processData(data: any) {
  return data.whatever;
}
```

**Use type assertions sparingly:**
```typescript
// OK (when you know the type)
const feature = await repository.create(data as any); // Drizzle type issue

// Bad (hiding type errors)
const result = response as SuccessResponse; // Should use type guard
```

---

## Testing

### Test Strategy

**Unit Tests:** Core utilities, validation, geometry functions  
**Integration Tests:** API endpoints, database queries  
**E2E Tests:** Full workflows with real database

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Writing Tests

**File naming:** `*.test.ts` next to source file

**Structure:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('GeoFeatureRepository', () => {
  beforeEach(async () => {
    // Setup test database
  });

  it('should find feature by id', async () => {
    // Arrange
    const feature = await createTestFeature();
    
    // Act
    const result = await repository.findById(feature.id);
    
    // Assert
    expect(result).toBeDefined();
    expect(result?.id).toBe(feature.id);
  });

  it('should return undefined for non-existent feature', async () => {
    const result = await repository.findById('non-existent');
    expect(result).toBeUndefined();
  });
});
```

### Test Database

Use separate test database:
```bash
# .env.test
DB_NAME=geoservices_test
```

---

## Database Management

### Schema Changes

**Workflow:**
1. Edit `packages/api/src/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review SQL in `drizzle/` folder
4. Test migration: `pnpm db:migrate`
5. Commit schema + migration files

**Example - Add column:**
```typescript
// schema.ts
export const geoFeatures = pgTable('geo_features', {
  // ... existing columns
  newColumn: text('new_column'), // Add this
});
```

```bash
pnpm db:generate
# Review drizzle/000X_migration.sql
pnpm db:migrate
```

### Seed Data

**Add new seed data:**
1. Edit `packages/api/src/db/seed.ts`
2. Add data to appropriate array
3. Run: `pnpm db:seed`

**Create custom seed script:**
```typescript
// seed-custom.ts
import { seed } from './seed.js';

async function customSeed() {
  await seed();
  // Additional seeding
}
```

### Database Reset

**Development only:**
```bash
# Drop all tables and recreate
psql -h localhost -U postgres -d geoservices \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run migrations
pnpm db:migrate:seed
```

---

## Common Tasks

### Add New API Endpoint

1. **Add route:**
```typescript
// packages/api/src/routes/features.ts
fastify.get('/features/custom', async (request, reply) => {
  // Implementation
});
```

2. **Add repository method if needed:**
```typescript
// packages/api/src/repositories/geo-feature-repository.ts
async customQuery(params: CustomParams) {
  return this.db.select()...;
}
```

3. **Add validation schema:**
```typescript
// packages/core/src/validation/schemas.ts
export const customQuerySchema = z.object({
  // ...
});
```

4. **Test endpoint:**
```bash
curl -X GET http://localhost:3000/api/v1/features/custom
```

### Add New Database Table

1. **Add to schema:**
```typescript
// packages/api/src/db/schema.ts
export const newTable = pgTable('new_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  // ... columns
});

// Export types
export type NewTable = typeof newTable.$inferSelect;
export type NewNewTable = typeof newTable.$inferInsert;
```

2. **Generate migration:**
```bash
pnpm db:generate
```

3. **Review and apply:**
```bash
# Review drizzle/000X_new_migration.sql
pnpm db:migrate
```

### Add Environment Variable

1. **Add to .env.example:**
```bash
NEW_CONFIG_VALUE=default
```

2. **Use in code:**
```typescript
const newConfig = process.env.NEW_CONFIG_VALUE || 'default';
```

3. **Document in README:**
Update environment variables section.

### Deploy Infrastructure Changes

```bash
cd cdk

# Review changes
npm run diff -- --context stage=dev

# Deploy
npm run deploy -- --context stage=dev
```

---

## Troubleshooting

### Database Connection Fails

**Error:** "Connection refused" or "timeout"

**Solutions:**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -U postgres -d geoservices -c "SELECT 1;"

# Check .env credentials
cat .env | grep DB_
```

### PostGIS Extension Not Found

**Error:** "extension postgis does not exist"

**Solution:**
```bash
# Install PostGIS
# Ubuntu/Debian
sudo apt-get install postgresql-15-postgis-3

# macOS
brew install postgis

# Enable extension
psql -h localhost -U postgres -d geoservices \
  -c "CREATE EXTENSION postgis;"
```

### Port Already in Use

**Error:** "EADDRINUSE: port 3000"

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=3001
```

### Type Errors After pnpm install

**Error:** "Cannot find module" or type mismatches

**Solution:**
```bash
# Clean install
rm -rf node_modules
pnpm install

# Rebuild packages
pnpm -r build

# Restart TypeScript server in VS Code
Cmd+Shift+P > "TypeScript: Restart TS Server"
```

### Migration Fails

**Error:** Migration SQL error

**Solutions:**
```bash
# Check current migration status
psql -h localhost -U postgres -d geoservices \
  -c "SELECT * FROM drizzle.__drizzle_migrations;"

# Manual rollback (development only)
# Drop the table created by failed migration
psql -h localhost -U postgres -d geoservices \
  -c "DROP TABLE IF EXISTS failed_table;"

# Re-run migration
pnpm db:migrate
```

### Docker Build Fails

**Error:** Build fails or image too large

**Solutions:**
```bash
# Clean Docker cache
docker system prune -a

# Build with no cache
docker build --no-cache -t geoservices-api .

# Check .dockerignore includes node_modules
cat .dockerignore | grep node_modules
```

---

## Architecture

### Request Flow

```
1. Client → ALB (AWS)
2. ALB → ECS Task (Fargate)
3. ECS Task → Fastify Server
4. Fastify → Middleware (auth, logging)
5. Middleware → Route Handler
6. Route Handler → Repository
7. Repository → PostgreSQL (Aurora)
8. Response flows back through stack
```

### Database Design

**Single Table Pattern:**
- One `geo_features` table
- JSONB `properties` column for flexibility
- No table-per-dataset (Carto's mistake)

**Multi-Tenancy:**
- Bureau-level isolation via `bureau_id`
- Owner-level permissions (user/group)

**Indexes:**
- GIST (geometry) - Spatial queries
- GIN (properties, name) - Fast filtering
- B-tree (bureau_id, owner, updated_at) - Lookups

### Connection Pooling

**ECS (Persistent):**
- 20 connections per task
- Shared across requests
- Direct Aurora connection

**Lambda (Ephemeral):**
- 1 connection per container
- RDS Proxy multiplexing
- For cold path (imports, admin)

### Authentication Flow

```
1. Client sends JWT in Authorization header
2. Middleware extracts token
3. Validate JWT signature + claims
4. Parse user info (userId, bureauId, groups)
5. Attach user to request
6. Route handler checks permissions
```

---

## Contributing

### Git Workflow

**Branches:**
- `main` - Production-ready code
- `epic/X-description` - Epic branches
- `feat/description` - Feature branches
- `fix/description` - Bug fixes

**Commits:**
Follow conventional commits:
```bash
feat: add radius search endpoint
fix: correct bbox query boundary condition
docs: update database setup guide
refactor: simplify error handling
test: add repository unit tests
chore: update dependencies
```

**Pull Requests:**
1. Create feature branch from `main`
2. Make changes with tests
3. Run `pnpm typecheck` and `pnpm test`
4. Create PR with description
5. Request review
6. Merge after approval

### Code Review Checklist

**Functionality:**
- [ ] Code works as intended
- [ ] Edge cases handled
- [ ] Error handling present

**Quality:**
- [ ] Type safe (no `any`)
- [ ] Follows code standards
- [ ] Has tests
- [ ] Documentation updated

**Performance:**
- [ ] No N+1 queries
- [ ] Proper indexes used
- [ ] Caching considered

**Security:**
- [ ] Input validation
- [ ] Authorization checks
- [ ] No SQL injection risk

### Documentation

**When to update:**
- New feature → Update README
- Schema change → Update DATABASE.md
- Architecture change → Update ARCHITECTURE.md
- Breaking change → Update migration guide

**Keep updated:**
- API endpoint documentation
- Environment variables
- Setup instructions
- Troubleshooting section

---

## Resources

### External Documentation
- [Fastify Documentation](https://fastify.dev/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

### Internal Documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Development roadmap
- [DATABASE.md](././DATABASE.md) - Database guide
- [EPIC1_COMPLETE.md](./EPIC1_COMPLETE.md) - Infrastructure details
- [EPIC3_COMPLETE.md](./EPIC3_COMPLETE.md) - API details

### Tools
- [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) - Database UI
- [Postman](https://www.postman.com/) - API testing
- [pgAdmin](https://www.pgadmin.org/) - PostgreSQL management
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) - Containers

---

## Getting Help

**Questions about:**
- Architecture → See ARCHITECTURE.md
- Database → See DATABASE.md
- API → See packages/api/README.md
- Deployment → See scripts/deploy.sh

**Common issues:**
- Check Troubleshooting section above
- Search closed issues in GitHub
- Ask in team chat

**Report bugs:**
- Include error message
- Include reproduction steps
- Include environment (OS, Node version, etc.)

---

*Last Updated: 2026-04-17*
