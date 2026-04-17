import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateDoiJwt, type DoiIdentityConfig } from '@doi/geoservices-core/auth';
import type { DoiUser } from '@doi/geoservices-core';
import { getLogger } from '@doi/geoservices-core/utils';

const logger = getLogger('auth-middleware');

/**
 * DOI Identity configuration from environment
 */
function getDoiConfig(): DoiIdentityConfig {
  return {
    issuer: process.env.DOI_IDENTITY_ISSUER || 'https://identity.doi.gov',
    audience: process.env.DOI_IDENTITY_AUDIENCE || 'geoservices',
    publicKey: process.env.DOI_IDENTITY_PUBLIC_KEY,
    secret: process.env.DOI_IDENTITY_SECRET,
    algorithm: (process.env.DOI_IDENTITY_ALGORITHM as 'RS256' | 'HS256') || 'RS256',
  };
}

/**
 * Extract JWT from Authorization header
 */
function extractToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (!authHeader) return undefined;

  // Bearer token format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}

/**
 * Fastify request with DOI user
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: DoiUser;
}

/**
 * Authentication middleware
 * Validates JWT and attaches user to request
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract token
    const token = extractToken(request);
    if (!token) {
      logger.warn({ path: request.url }, 'Missing authorization token');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing authorization token',
      });
    }

    // Validate JWT
    const config = getDoiConfig();
    const user = await validateDoiJwt(token, config);

    // Attach user to request
    (request as AuthenticatedRequest).user = user;

    logger.debug(
      {
        userId: user.userId,
        bureauId: user.bureauId,
        path: request.url,
      },
      'User authenticated'
    );
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        path: request.url,
      },
      'Authentication failed'
    );

    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Optional authentication middleware
 * Validates JWT if present, but doesn't fail if missing
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const token = extractToken(request);
    if (!token) return; // No token, skip

    const config = getDoiConfig();
    const user = await validateDoiJwt(token, config);

    (request as AuthenticatedRequest).user = user;

    logger.debug(
      {
        userId: user.userId,
        bureauId: user.bureauId,
        path: request.url,
      },
      'User authenticated (optional)'
    );
  } catch (error) {
    // Ignore authentication errors for optional auth
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
        path: request.url,
      },
      'Optional authentication failed (ignored)'
    );
  }
}

/**
 * Authorization helper: check if user can access bureau
 */
export function requireBureauAccess(
  user: DoiUser,
  bureauId: string
): boolean {
  // Cross-bureau admins can access any bureau
  if (user.isCrossBureauAdmin) return true;

  // User must be in the same bureau
  return user.bureauId === bureauId;
}

/**
 * Get user from request (for type safety)
 */
export function getUser(request: FastifyRequest): DoiUser {
  const user = (request as AuthenticatedRequest).user;
  if (!user) {
    throw new Error('User not authenticated (middleware not applied?)');
  }
  return user;
}
