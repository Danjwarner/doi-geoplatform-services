/**
 * Database migration script
 *
 * Runs pending migrations and optionally seeds the database
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { getLogger } from '@doi/geoservices-core/utils';
import { seed } from './seed.js';

const logger = getLogger('migrate');

interface MigrationOptions {
  seedAfterMigration?: boolean;
  installPostGIS?: boolean;
}

/**
 * Run database migrations
 */
async function runMigrations(options: MigrationOptions = {}) {
  const { seedAfterMigration = false, installPostGIS = true } = options;

  logger.info('Starting database migration...');

  // Create connection
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'geoservices',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const db = drizzle(pool);

  try {
    // 1. Install PostGIS if needed
    if (installPostGIS) {
      logger.info('Installing PostGIS extensions...');
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis_topology`);

      const result = await db.execute(sql`SELECT PostGIS_version() as version`);
      logger.info({ version: result.rows[0] }, 'PostGIS installed');
    }

    // 2. Run migrations
    logger.info('Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.info('Migrations completed successfully');

    // 3. Seed database if requested
    if (seedAfterMigration) {
      logger.info('Seeding database...');
      await seed();
    }

    logger.info('Database migration completed successfully!');
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    throw error;
  } finally {
    await pool.end();
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const seedFlag = args.includes('--seed');
const noPostGIS = args.includes('--no-postgis');

// Run migrations if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations({
    seedAfterMigration: seedFlag,
    installPostGIS: !noPostGIS,
  })
    .then(() => {
      logger.info('Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Migration script failed');
      process.exit(1);
    });
}

export { runMigrations };
