# GeoServices API

Production-ready Fastify API service for the DOI GeoServices Platform.

## Features

- **Spatial Queries**: PostGIS-powered bbox, radius, and intersection searches
- **Flexible Schema**: Single table + JSONB properties (no table-per-dataset sprawl)
- **Multi-Tenancy**: DOI bureau-level isolation with user/group ownership
- **Authentication**: DOI Identity JWT validation
- **High Performance**: Connection pooling (20 connections/task on ECS)
- **Production Ready**: Structured logging, error handling, health checks

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+ with PostGIS

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env with your database credentials
```

### Database Setup

See [../../docs/DATABASE.md](../../docs/DATABASE.md) for full documentation.

```bash
# Run migrations (installs PostGIS + creates tables)
pnpm db:migrate

# Seed with sample data (optional)
pnpm db:seed

# Or do both in one command
pnpm db:migrate:seed
```

### Development

```bash
# Start dev server with hot reload
pnpm dev

# API available at http://localhost:3000
```

### Build & Deploy

```bash
# Type check
pnpm typecheck

# Build for production
pnpm build

# Start production server
pnpm start
```

## API Endpoints

### Health Checks

- `GET /health` - Basic liveness check
- `GET /health/ready` - Readiness check (tests DB connection)
- `GET /health/live` - Container health

### Features API

**Authentication Required:** All feature endpoints require DOI Identity JWT in `Authorization: Bearer <token>` header.

#### List Features
```http
GET /api/v1/features?bureauId=nps&page=1&limit=50
```

Query parameters:
- `bureauId` - Filter by bureau (optional, defaults to user's bureau)
- `ownerId` - Filter by owner
- `ownerType` - Filter by owner type (user/group)
- `nameContains` - Search by name
- `page` - Page number (default: 1)
- `limit` - Page size (default: 50, max: 500)
- `sortBy` - Sort field (name/createdAt/updatedAt)
- `sortDir` - Sort direction (asc/desc)
- `bbox` - Bounding box (format: "minLon,minLat,maxLon,maxLat")

#### Get Feature
```http
GET /api/v1/features/:id
```

#### Create Feature
```http
POST /api/v1/features
Content-Type: application/json

{
  "name": "My Feature",
  "description": "Feature description",
  "geometry": {
    "type": "Point",
    "coordinates": [-110.5885, 44.4280]
  },
  "properties": {
    "customField": "value"
  },
  "bureauId": "nps",
  "ownerId": "user-123",
  "ownerType": "user"
}
```

#### Update Feature
```http
PUT /api/v1/features/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "properties": {
    "newField": "newValue"
  }
}
```

#### Delete Feature
```http
DELETE /api/v1/features/:id
```

### Spatial Search

#### Bounding Box Search
```http
POST /api/v1/features/search/bbox
Content-Type: application/json

{
  "bbox": [-115.0, 36.0, -114.0, 37.0],
  "bureauId": "nps",
  "page": 1,
  "limit": 50
}
```

#### Radius Search
```http
POST /api/v1/features/search/radius
Content-Type: application/json

{
  "center": {
    "type": "Point",
    "coordinates": [-110.5885, 44.4280]
  },
  "radiusMeters": 50000,
  "bureauId": "nps"
}
```

#### Intersection Search
```http
POST /api/v1/features/search/intersects
Content-Type: application/json

{
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [-115.0, 36.0],
      [-114.0, 36.0],
      [-114.0, 37.0],
      [-115.0, 37.0],
      [-115.0, 36.0]
    ]]
  },
  "bureauId": "nps"
}
```

## Authorization

### Bureau-Level Access
- Users can only access features from their own bureau
- Cross-bureau admins can access all bureaus

### Owner-Level Permissions
- **Read**: All bureau members can read features
- **Write/Delete**: Only owners (user or group member) can modify/delete

## Docker

### Build Image
```bash
docker build -t geoservices-api .
```

### Run Container
```bash
docker run -p 3000:3000 \
  -e DB_HOST=postgres \
  -e DB_PASSWORD=secret \
  geoservices-api
```

### Docker Compose (Development)
```yaml
version: '3.8'
services:
  postgres:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_DB: geoservices
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DB_HOST: postgres
      DB_NAME: geoservices
      DB_USER: postgres
      DB_PASSWORD: postgres
    depends_on:
      - postgres

volumes:
  pgdata:
```

## Project Structure

```
packages/api/
├── src/
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema definitions
│   │   ├── connection.ts       # Connection pooling (ECS/Lambda)
│   │   ├── migrate.ts          # Migration runner
│   │   └── seed.ts             # Seed data
│   ├── middleware/
│   │   ├── auth.ts             # DOI Identity JWT validation
│   │   ├── error-handler.ts   # Global error handling
│   │   └── logging.ts          # Request/response logging
│   ├── repositories/
│   │   └── geo-feature-repository.ts  # Database queries
│   ├── routes/
│   │   ├── features.ts         # Feature CRUD + spatial search
│   │   └── health.ts           # Health check endpoints
│   └── server.ts               # Fastify server setup
├── drizzle/                    # Generated migration files
├── Dockerfile                  # Production container image
├── DATABASE.md                 # Database documentation
└── package.json
```

## Environment Variables

See [.env.example](./.env.example) for all configuration options.

**Required:**
- `DB_HOST` - PostgreSQL host
- `DB_PASSWORD` - PostgreSQL password

**Optional but Recommended:**
- `DOI_IDENTITY_ISSUER` - JWT issuer URL
- `DOI_IDENTITY_PUBLIC_KEY` - JWT verification key
- `REDIS_HOST` - ElastiCache endpoint (for caching)

## Performance

### Connection Pooling
- **ECS Tasks**: 20 connections per task (persistent)
- **Lambda**: 1 connection per container (via RDS Proxy)

### Caching Strategy
1. **CloudFront** (edge) - Tile caching
2. **Redis** (ElastiCache) - Feature/tile caching
3. **Aurora** (database) - Source of truth

### Indexes
- **GIST** index on geometry for spatial queries
- **GIN** index on JSONB properties for fast filtering
- **B-tree** indexes on bureau, owner, updated_at

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Monitoring

### Logs
Structured JSON logs via Pino:
```json
{
  "level": "info",
  "time": 1234567890,
  "module": "features-routes",
  "msg": "Feature created",
  "featureId": "uuid",
  "userId": "user-123"
}
```

### Metrics
- Request duration
- Database query timing
- Cache hit/miss rates
- Error rates

### Health Checks
- `/health/live` - Container is running
- `/health/ready` - Database is accessible

## Troubleshooting

### Database Connection Issues

Check connectivity:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();"
```

### PostGIS Not Installed

```bash
# Install PostGIS extension
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION postgis;"
```

### Port Already in Use

Change port in `.env`:
```bash
PORT=3001
```

## Contributing

1. Make schema changes in `src/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review SQL in `drizzle/` folder
4. Test migration: `pnpm db:migrate`
5. Commit schema + migration files

## Related Documentation

- [../../docs/DATABASE.md](../../docs/DATABASE.md) - Database setup and migrations
- [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - System architecture
- [../../docs/DEVELOPER.md](../../docs/DEVELOPER.md) - Developer guide
- [../../docs/IMPLEMENTATION_PLAN.md](../../docs/IMPLEMENTATION_PLAN.md) - Development roadmap

## License

DOI Internal Use Only
