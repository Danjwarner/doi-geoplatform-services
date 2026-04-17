import type { FastifyInstance } from 'fastify';
import { testDbConnection } from '../db/connection.js';
import { getLogger } from '@doi/geoservices-core/utils';

const logger = getLogger('health-routes');

/**
 * Health check routes
 */
export async function healthRoutes(fastify: FastifyInstance) {
  // ========================================================================
  // GET /health - Basic health check
  // ========================================================================

  fastify.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'geoservices-api',
      version: process.env.APP_VERSION || '0.1.0',
    });
  });

  // ========================================================================
  // GET /health/ready - Readiness check (includes DB)
  // ========================================================================

  fastify.get('/health/ready', async (_request, reply) => {
    try {
      // Test database connection
      const dbHealthy = await testDbConnection(fastify.db);

      if (!dbHealthy) {
        return reply.code(503).send({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          checks: {
            database: 'fail',
          },
        });
      }

      return reply.send({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'ok',
        },
      });
    } catch (error) {
      logger.error({ error }, 'Readiness check failed');

      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ========================================================================
  // GET /health/live - Liveness check
  // ========================================================================

  fastify.get('/health/live', async (_request, reply) => {
    return reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });
}
