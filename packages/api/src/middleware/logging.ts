import type { FastifyRequest, FastifyReply } from 'fastify';
import { getLogger } from '@doi/geoservices-core/utils';

const logger = getLogger('http');

/**
 * Request logging middleware
 * Logs all incoming requests and responses
 */
export async function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();

  // Log incoming request
  logger.info(
    {
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        headers: {
          'user-agent': request.headers['user-agent'],
          'content-type': request.headers['content-type'],
        },
      },
    },
    'Incoming request'
  );

  // Log response when reply hook fires
  const origSend = reply.send.bind(reply);
  reply.send = function (payload: any) {
    const duration = Date.now() - startTime;

    logger.info(
      {
        request: {
          method: request.method,
          url: request.url,
        },
        response: {
          statusCode: reply.statusCode,
          duration,
        },
      },
      'Request completed'
    );

    return origSend(payload);
  };
}
