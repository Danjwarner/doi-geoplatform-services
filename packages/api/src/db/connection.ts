import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema.js';

/**
 * Database connection configuration
 */
export interface DbConnectionConfig {
  /** Database host (Aurora endpoint or RDS Proxy) */
  host: string;
  /** Database port (default: 5432) */
  port?: number;
  /** Database name */
  database: string;
  /** Database username */
  user: string;
  /** Database password */
  password: string;
  /** SSL/TLS configuration */
  ssl?: boolean | { rejectUnauthorized: boolean };
  /** Connection pool configuration */
  pool?: {
    /** Maximum number of connections in pool */
    max?: number;
    /** Minimum number of connections to keep alive */
    min?: number;
    /** Idle timeout in milliseconds */
    idleTimeoutMillis?: number;
    /** Connection timeout in milliseconds */
    connectionTimeoutMillis?: number;
  };
}

/**
 * Singleton connection pool for ECS
 * Reuses connections across requests
 */
let ecsPool: Pool | undefined;

/**
 * Singleton connection pool for Lambda
 * Optimized for Lambda's ephemeral environment
 */
let lambdaPool: Pool | undefined;

/**
 * Get database connection for ECS Fargate
 *
 * ECS runs continuously, so we maintain a persistent pool
 * with multiple connections (default: 20)
 *
 * @param config - Database configuration
 * @returns Drizzle ORM instance
 */
export function getEcsDb(config: DbConnectionConfig) {
  if (!ecsPool) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ?? { rejectUnauthorized: false },

      // ECS pool settings: maintain persistent connections
      max: config.pool?.max ?? 20, // 20 connections per ECS task
      min: config.pool?.min ?? 5, // Keep 5 warm
      idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 60000, // 1 min
      connectionTimeoutMillis: config.pool?.connectionTimeoutMillis ?? 5000, // 5 sec

      // Application name for debugging
      application_name: 'geoservices-ecs',
    };

    ecsPool = new Pool(poolConfig);

    // Log pool errors
    ecsPool.on('error', (err) => {
      console.error('ECS database pool error:', err);
    });

    // Log new connections (debug only)
    ecsPool.on('connect', () => {
      console.log('ECS database connection established');
    });
  }

  return drizzle(ecsPool, { schema });
}

/**
 * Get database connection for AWS Lambda
 *
 * Lambda is ephemeral, so we use minimal pooling
 * and connect via RDS Proxy for multiplexing
 *
 * @param config - Database configuration (use RDS Proxy endpoint)
 * @returns Drizzle ORM instance
 */
export function getLambdaDb(config: DbConnectionConfig) {
  if (!lambdaPool) {
    const poolConfig: PoolConfig = {
      host: config.host, // RDS Proxy endpoint
      port: config.port || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ?? { rejectUnauthorized: false },

      // Lambda pool settings: minimal, rely on RDS Proxy
      max: config.pool?.max ?? 1, // 1 connection per Lambda container
      min: config.pool?.min ?? 0, // Don't keep idle connections
      idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 60000, // 1 min
      connectionTimeoutMillis: config.pool?.connectionTimeoutMillis ?? 10000, // 10 sec

      // Application name for debugging
      application_name: 'geoservices-lambda',
    };

    lambdaPool = new Pool(poolConfig);

    // Log pool errors
    lambdaPool.on('error', (err) => {
      console.error('Lambda database pool error:', err);
    });
  }

  return drizzle(lambdaPool, { schema });
}

/**
 * Close database connections
 * Call this on graceful shutdown (ECS) or test cleanup
 */
export async function closeDbConnections() {
  const promises: Promise<void>[] = [];

  if (ecsPool) {
    promises.push(ecsPool.end());
    ecsPool = undefined;
  }

  if (lambdaPool) {
    promises.push(lambdaPool.end());
    lambdaPool = undefined;
  }

  await Promise.all(promises);
}

/**
 * Get database connection from environment variables
 *
 * Expected environment variables:
 * - DB_HOST: Database endpoint (Aurora or RDS Proxy)
 * - DB_PORT: Database port (default: 5432)
 * - DB_NAME: Database name
 * - DB_USER: Database username
 * - DB_PASSWORD: Database password
 * - DB_SSL: Enable SSL (default: true)
 *
 * @param isLambda - Whether running in Lambda (vs ECS)
 * @returns Drizzle ORM instance
 */
export function getDbFromEnv(isLambda = false) {
  const config: DbConnectionConfig = {
    host: process.env.DB_HOST!,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    database: process.env.DB_NAME || 'geoservices',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD!,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  };

  // Validate required fields
  if (!config.host || !config.password) {
    throw new Error('Missing required database configuration: DB_HOST, DB_PASSWORD');
  }

  return isLambda ? getLambdaDb(config) : getEcsDb(config);
}

/**
 * Health check: test database connectivity
 *
 * @param db - Drizzle ORM instance
 * @returns Promise<boolean> - true if connection successful
 */
export async function testDbConnection(db: NodePgDatabase<any>): Promise<boolean> {
  try {
    // Simple query to test connectivity
    const result = await db.execute(sql`SELECT 1 as test, version() as version`);
    console.log('Database connection successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * Install PostGIS extension if not already installed
 *
 * Run this once after infrastructure deployment
 *
 * @param db - Drizzle ORM instance
 */
export async function installPostGIS(db: NodePgDatabase<any>) {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis_topology`);

    // Verify PostGIS version
    const result = await db.execute(sql`SELECT PostGIS_version() as version`);
    console.log('PostGIS installed:', result.rows[0]);
  } catch (error) {
    console.error('Failed to install PostGIS:', error);
    throw error;
  }
}
