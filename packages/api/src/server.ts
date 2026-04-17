import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { getEcsDb, closeDbConnections } from './db/connection.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/logging.js';
import { featureRoutes } from './routes/features.js';
import { healthRoutes } from './routes/health.js';
import { getLogger } from '@doi/geoservices-core/utils';

const logger = getLogger('server');

// Extend Fastify instance with DB
declare module 'fastify' {
  interface FastifyInstance {
    db: NodePgDatabase<any>;
  }
}

/**
 * Build Fastify server
 */
async function buildServer() {
  const fastify = Fastify({
    logger: false, // Use our custom logger instead
    trustProxy: true, // Trust ALB/ELB headers
    requestIdHeader: 'x-request-id',
  });

  // ========================================================================
  // PLUGINS
  // ========================================================================

  // Security: CORS
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Security: Helmet (security headers)
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Allow external resources for maps
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  });

  // ========================================================================
  // DATABASE CONNECTION
  // ========================================================================

  // Initialize database connection
  const db = getEcsDb({
    host: process.env.DB_HOST!,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    database: process.env.DB_NAME || 'geoservices',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD!,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });

  // Attach to fastify instance
  fastify.decorate('db', db);

  logger.info('Database connection initialized');

  // ========================================================================
  // GLOBAL MIDDLEWARE
  // ========================================================================

  // Request logging
  fastify.addHook('onRequest', requestLogger);

  // Global error handler
  fastify.setErrorHandler(errorHandler);

  // ========================================================================
  // ROUTES
  // ========================================================================

  // Health checks (no auth)
  await fastify.register(healthRoutes);

  // Feature routes (requires auth)
  await fastify.register(
    async (instance) => {
      instance.addHook('onRequest', authenticate);
      await instance.register(featureRoutes);
    },
    { prefix: '/api/v1' }
  );

  // ========================================================================
  // GRACEFUL SHUTDOWN
  // ========================================================================

  fastify.addHook('onClose', async () => {
    logger.info('Closing database connections...');
    await closeDbConnections();
  });

  return fastify;
}

/**
 * Start server
 */
async function start() {
  try {
    const fastify = await buildServer();

    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT || '3000');

    await fastify.listen({ host, port });

    logger.info(
      {
        host,
        port,
        env: process.env.NODE_ENV || 'development',
      },
      'Server started'
    );

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      try {
        await fastify.close();
        logger.info('Server closed gracefully');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer, start };
