# Database Setup Guide

This guide covers database migrations, seeding, and management for the GeoServices API.

## Prerequisites

- PostgreSQL 15+ with PostGIS extension
- Database credentials (connection string or env vars)

## Environment Variables

Set these environment variables before running database commands:

```bash
# Required
DB_HOST=localhost           # Database host (Aurora endpoint in AWS)
DB_PORT=5432               # Database port
DB_NAME=geoservices        # Database name
DB_USER=postgres           # Database user
DB_PASSWORD=your-password  # Database password

# Optional
DB_SSL=false              # Enable SSL (true for AWS RDS/Aurora)
```

## Quick Start

### 1. Generate Migration Files

After modifying the schema in `src/db/schema.ts`:

```bash
pnpm db:generate
```

This creates SQL migration files in the `drizzle/` directory.

### 2. Run Migrations

Apply pending migrations to the database:

```bash
pnpm db:migrate
```

This will:
- Install PostGIS extensions (if not already installed)
- Run all pending SQL migrations
- Create tables, indexes, and constraints

### 3. Seed Database (Optional)

Populate the database with sample data:

```bash
pnpm db:seed
```

Or run migrations + seed in one command:

```bash
pnpm db:migrate:seed
```

## Database Schema

### Tables

#### `bureaus`
DOI organizational units (NPS, BLM, FWS, etc.)

| Column       | Type      | Description                      |
|--------------|-----------|----------------------------------|
| id           | text      | Bureau ID (e.g., 'nps', 'blm')  |
| name         | text      | Full name                        |
| abbreviation | text      | Short code                       |
| description  | text      | Bureau description               |
| created_at   | timestamp | Created timestamp                |

#### `geo_features`
Main features table with flexible JSONB properties

| Column      | Type                | Description                          |
|-------------|---------------------|--------------------------------------|
| id          | uuid                | Primary key (auto-generated)         |
| geometry    | geometry(4326)      | PostGIS geometry (WGS 84)           |
| name        | text                | Feature name                         |
| description | text                | Feature description                  |
| properties  | jsonb               | Flexible key-value properties        |
| bureau_id   | text                | Owning bureau (FK → bureaus)        |
| owner_id    | text                | Owner user/group ID                  |
| owner_type  | enum                | 'user' or 'group'                    |
| created_at  | timestamp           | Created timestamp                    |
| updated_at  | timestamp           | Last updated timestamp               |
| created_by  | text                | User ID who created                  |
| updated_by  | text                | User ID who last updated             |

**Indexes:**
- `idx_geometry` (GIST) - Spatial queries
- `idx_properties` (GIN) - JSONB queries
- `idx_bureau` (B-tree) - Bureau filtering
- `idx_owner` (B-tree) - Owner filtering
- `idx_updated` (B-tree) - Recency sorting
- `idx_name_search` (GIN) - Full-text search

#### `user_groups`
User groups for group-based ownership

| Column      | Type      | Description                      |
|-------------|-----------|----------------------------------|
| id          | uuid      | Primary key (auto-generated)     |
| name        | text      | Group name                       |
| bureau_id   | text      | Bureau (FK → bureaus)            |
| description | text      | Group description                |
| created_at  | timestamp | Created timestamp                |

#### `group_members`
User membership in groups

| Column   | Type      | Description                          |
|----------|-----------|--------------------------------------|
| group_id | uuid      | Group (FK → user_groups)             |
| user_id  | text      | User ID from DOI Identity            |
| role     | text      | Member role                          |
| added_at | timestamp | When user was added                  |
| added_by | text      | User ID who added this member        |

**Indexes:**
- `group_members_pkey` - Composite primary key (group_id, user_id)
- `idx_user_groups` - User lookup

## Seed Data

The seed script (`src/db/seed.ts`) populates:

### DOI Bureaus (9 bureaus)
- NPS - National Park Service
- BLM - Bureau of Land Management
- FWS - U.S. Fish and Wildlife Service
- USGS - U.S. Geological Survey
- BOR - Bureau of Reclamation
- OSMRE - Office of Surface Mining
- BSEE - Bureau of Safety and Environmental Enforcement
- BOEM - Bureau of Ocean Energy Management
- BIA - Bureau of Indian Affairs

### Sample User Groups (4 groups)
- NPS GIS Team
- BLM Field Offices
- FWS Biologists
- USGS Research Team

### Sample Geo Features (7 features)
- **National Parks**: Yellowstone, Grand Canyon, Yosemite, Zion, Glacier
- **Wildlife Refuges**: Arctic National Wildlife Refuge
- **BLM Areas**: Red Rock Canyon National Conservation Area

Each feature includes:
- Name, description, geometry (point location)
- Rich JSONB properties (established date, area, visitors, features, etc.)
- Bureau ownership

## Database Commands Reference

### Generate Migrations
```bash
pnpm db:generate
```
Creates SQL migration files from schema changes.

### Run Migrations
```bash
pnpm db:migrate                  # Run migrations only
pnpm db:migrate:seed             # Run migrations + seed data
```

### Seed Database
```bash
pnpm db:seed
```
Populates database with sample data (idempotent - won't duplicate data).

### Push Schema (Development Only)
```bash
pnpm db:push
```
Push schema changes directly to database without creating migration files.
**Warning:** Only use in development. Use migrations for production.

### Drizzle Studio
```bash
pnpm db:studio
```
Launch Drizzle Studio web UI to browse and edit database data.

## PostGIS Extension

The migration script automatically installs PostGIS extensions:
- `postgis` - Spatial types and functions
- `postgis_topology` - Topology support

To skip PostGIS installation (if already installed):
```bash
tsx src/db/migrate.ts --no-postgis
```

## AWS RDS/Aurora Setup

When deploying to AWS:

1. **Enable SSL:**
   ```bash
   DB_SSL=true
   ```

2. **Use RDS Proxy endpoint** for Lambda:
   ```bash
   DB_HOST=your-rds-proxy.proxy-xxx.us-east-1.rds.amazonaws.com
   ```

3. **Use Aurora cluster endpoint** for ECS:
   ```bash
   DB_HOST=your-cluster.cluster-xxx.us-east-1.rds.amazonaws.com
   ```

4. **Secrets Manager:**
   Store credentials in AWS Secrets Manager and inject via environment variables.

## Troubleshooting

### PostGIS Extension Not Found

If you get "extension postgis does not exist":

1. Install PostGIS on your PostgreSQL instance:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql-15-postgis-3
   
   # macOS (Homebrew)
   brew install postgis
   ```

2. Enable the extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

### Migration Fails

Check connection:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();"
```

Reset database (development only):
```bash
# Drop all tables
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run migrations
pnpm db:migrate:seed
```

### Seed Data Already Exists

The seed script uses `onConflictDoNothing()` so it's safe to re-run. It won't duplicate data.

## Production Deployment

### CDK Infrastructure
The infrastructure stack (`cdk/lib/stacks/infrastructure-stack.ts`) creates:
- Aurora Serverless v2 PostgreSQL cluster
- Read replica for tile queries
- RDS Proxy for Lambda connection pooling
- Security groups and secrets

### Migration Strategy

**Option 1: ECS Task**
Run migrations as a one-time ECS task during deployment:
```bash
aws ecs run-task \
  --cluster geoservices-cluster \
  --task-definition geoservices-migrate \
  --launch-type FARGATE
```

**Option 2: CI/CD Pipeline**
Run migrations in deployment pipeline before updating services:
```bash
# In GitHub Actions / GitLab CI
- name: Run Database Migrations
  run: |
    export DB_HOST=${{ secrets.DB_HOST }}
    export DB_PASSWORD=${{ secrets.DB_PASSWORD }}
    pnpm db:migrate
```

**Option 3: Lambda Function**
Create a Lambda function that runs migrations on deployment.

### Zero-Downtime Migrations

1. **Add columns** (safe - can deploy before code):
   ```sql
   ALTER TABLE geo_features ADD COLUMN new_field text;
   ```

2. **Deploy code** that can handle old + new schema

3. **Backfill data** if needed

4. **Remove old columns** (after all code updated):
   ```sql
   ALTER TABLE geo_features DROP COLUMN old_field;
   ```

## Schema Management Best Practices

1. **Always use migrations** for schema changes (never edit schema.ts directly in production)

2. **Test migrations** on staging environment first

3. **Review generated SQL** in `drizzle/` before applying

4. **Use transactions** - Drizzle runs migrations in transactions by default

5. **Backup database** before running migrations in production

6. **Version control** migration files in git

7. **Don't modify** existing migration files - create new ones for changes

## More Information

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
