import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { getLogger } from '@doi/geoservices-core/utils';
import { ZodError } from 'zod';

const logger = getLogger('error-handler');

/**
 * Custom error types
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Global error handler for Fastify
 */
export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Log error
  logger.error(
    {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
      },
    },
    'Request error'
  );

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      })),
    });
  }

  // Handle custom errors
  if (error instanceof NotFoundError) {
    return reply.code(404).send({
      error: 'Not Found',
      message: error.message,
    });
  }

  if (error instanceof ForbiddenError) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: error.message,
    });
  }

  if (error instanceof ValidationError) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.details,
    });
  }

  // Handle Fastify errors
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return reply.code(error.statusCode).send({
      error: error.name,
      message: error.message,
    });
  }

  // Generic 500 error
  return reply.code(500).send({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message,
  });
}
