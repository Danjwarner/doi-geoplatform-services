import pino from 'pino';

/**
 * Structured logger using Pino
 *
 * Provides fast, JSON-structured logging for production
 */

/**
 * Log level
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel;
  pretty?: boolean;
  service?: string;
}

/**
 * Create a logger instance
 *
 * @param config - Logger configuration
 * @returns Pino logger instance
 */
export function createLogger(config: LoggerConfig = {}) {
  const {
    level = (process.env.LOG_LEVEL as LogLevel) || 'info',
    pretty = process.env.NODE_ENV === 'development',
    service = process.env.SERVICE_NAME || 'geoservices',
  } = config;

  return pino({
    level,
    base: {
      service,
      environment: process.env.NODE_ENV || 'development',
    },
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  });
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Get a logger with a specific name/module context
 *
 * @param name - Logger name or module identifier
 * @returns Child logger
 */
export function getLogger(name: string) {
  return logger.child({ module: name });
}

/**
 * Create a child logger with additional context
 *
 * @param context - Additional context fields
 * @returns Child logger
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log API request
 *
 * @param method - HTTP method
 * @param path - Request path
 * @param userId - User ID (if authenticated)
 * @param duration - Request duration in milliseconds
 * @param statusCode - HTTP status code
 */
export function logRequest(
  method: string,
  path: string,
  userId: string | undefined,
  duration: number,
  statusCode: number
) {
  logger.info(
    {
      type: 'request',
      method,
      path,
      userId,
      duration,
      statusCode,
    },
    `${method} ${path} ${statusCode} ${duration}ms`
  );
}

/**
 * Log database query
 *
 * @param query - SQL query
 * @param duration - Query duration in milliseconds
 * @param rowCount - Number of rows returned
 */
export function logQuery(query: string, duration: number, rowCount: number) {
  logger.debug(
    {
      type: 'query',
      query: query.substring(0, 200), // Truncate long queries
      duration,
      rowCount,
    },
    `Query executed in ${duration}ms, returned ${rowCount} rows`
  );
}

/**
 * Log cache operation
 *
 * @param operation - Cache operation (hit, miss, set, del)
 * @param key - Cache key
 * @param duration - Operation duration in milliseconds
 */
export function logCache(operation: 'hit' | 'miss' | 'set' | 'del', key: string, duration?: number) {
  logger.debug(
    {
      type: 'cache',
      operation,
      key,
      duration,
    },
    `Cache ${operation}: ${key}${duration ? ` (${duration}ms)` : ''}`
  );
}

/**
 * Log error with context
 *
 * @param error - Error object
 * @param context - Additional context
 */
export function logError(error: Error, context: Record<string, unknown> = {}) {
  logger.error(
    {
      type: 'error',
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      ...context,
    },
    error.message
  );
}

/**
 * Log authorization check
 *
 * @param userId - User ID
 * @param resource - Resource being accessed
 * @param permission - Permission requested
 * @param allowed - Whether access was allowed
 */
export function logAuth(userId: string, resource: string, permission: string, allowed: boolean) {
  logger.info(
    {
      type: 'authorization',
      userId,
      resource,
      permission,
      allowed,
    },
    `Authorization ${allowed ? 'granted' : 'denied'}: ${userId} ${permission} ${resource}`
  );
}

/**
 * Log spatial query performance
 *
 * @param queryType - Type of spatial query
 * @param bounds - Bounding box or radius
 * @param resultCount - Number of results
 * @param duration - Query duration in milliseconds
 */
export function logSpatialQuery(
  queryType: 'bbox' | 'radius' | 'intersects' | 'contains',
  bounds: unknown,
  resultCount: number,
  duration: number
) {
  logger.info(
    {
      type: 'spatial_query',
      queryType,
      bounds,
      resultCount,
      duration,
    },
    `Spatial ${queryType} query: ${resultCount} results in ${duration}ms`
  );
}
