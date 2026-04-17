import jwt from 'jsonwebtoken';
import type { DoiUser } from '../models/user';

/**
 * DOI Identity Server configuration
 */
export interface DoiIdentityConfig {
  /** DOI Identity Server issuer URL */
  issuer: string;

  /** JWT audience (API identifier) */
  audience: string;

  /** Public key for JWT verification (PEM format) */
  publicKey?: string;

  /** Secret for JWT verification (if using symmetric) */
  secret?: string;

  /** Algorithm (default: RS256 for asymmetric) */
  algorithm?: jwt.Algorithm;
}

/**
 * JWT validation error
 */
export class JwtValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'MISSING_TOKEN'
      | 'INVALID_TOKEN'
      | 'EXPIRED_TOKEN'
      | 'INVALID_ISSUER'
      | 'INVALID_AUDIENCE'
  ) {
    super(message);
    this.name = 'JwtValidationError';
  }
}

/**
 * Validate and decode DOI Identity JWT token
 *
 * @param token - JWT token (from Authorization header)
 * @param config - DOI Identity configuration
 * @returns DoiUser - Parsed user information
 * @throws JwtValidationError - If token is invalid
 */
export async function validateDoiJwt(token: string, config: DoiIdentityConfig): Promise<DoiUser> {
  if (!token) {
    throw new JwtValidationError('No token provided', 'MISSING_TOKEN');
  }

  try {
    // Verify JWT signature and claims
    const decoded = jwt.verify(token, config.publicKey || config.secret!, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: [config.algorithm || 'RS256'],
    }) as jwt.JwtPayload;

    // Extract user information from claims
    return parseDoiUser(decoded);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new JwtValidationError('Token expired', 'EXPIRED_TOKEN');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new JwtValidationError(`Invalid token: ${error.message}`, 'INVALID_TOKEN');
    }
    throw error;
  }
}

/**
 * Parse JWT payload into DoiUser
 *
 * Expected JWT claims structure:
 * {
 *   sub: "user-id",
 *   email: "user@doi.gov",
 *   name: "John Doe",
 *   bureau: "nps",
 *   groups: ["group-id-1", "group-id-2"],
 *   roles: ["user", "admin"],
 *   exp: 1234567890,
 *   iat: 1234567890
 * }
 */
function parseDoiUser(payload: jwt.JwtPayload): DoiUser {
  // Validate required claims
  if (!payload.sub) {
    throw new JwtValidationError('Missing required claim: sub (user ID)', 'INVALID_TOKEN');
  }
  if (!payload.bureau) {
    throw new JwtValidationError('Missing required claim: bureau', 'INVALID_TOKEN');
  }

  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  const groups = Array.isArray(payload.groups) ? payload.groups : [];

  return {
    userId: payload.sub,
    bureauId: payload.bureau,
    email: payload.email,
    name: payload.name,
    groups,
    roles,
    isCrossBureauAdmin: roles.includes('cross_bureau_admin'),
    exp: payload.exp,
    iat: payload.iat,
  };
}

/**
 * Extract JWT token from Authorization header
 *
 * Supports:
 * - "Bearer <token>"
 * - "<token>"
 *
 * @param authHeader - Authorization header value
 * @returns JWT token or null
 */
export function extractToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  // Remove "Bearer " prefix if present
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  return token.trim() || null;
}

/**
 * Get DOI Identity configuration from environment variables
 *
 * Expected environment variables:
 * - DOI_IDENTITY_ISSUER: Issuer URL
 * - DOI_IDENTITY_AUDIENCE: API audience
 * - DOI_IDENTITY_PUBLIC_KEY: Public key (PEM format) OR
 * - DOI_IDENTITY_SECRET: Shared secret
 *
 * @returns DoiIdentityConfig
 */
export function getDoiIdentityConfigFromEnv(): DoiIdentityConfig {
  const issuer = process.env.DOI_IDENTITY_ISSUER;
  const audience = process.env.DOI_IDENTITY_AUDIENCE || 'geoservices-api';
  const publicKey = process.env.DOI_IDENTITY_PUBLIC_KEY;
  const secret = process.env.DOI_IDENTITY_SECRET;

  if (!issuer) {
    throw new Error('Missing required environment variable: DOI_IDENTITY_ISSUER');
  }

  if (!publicKey && !secret) {
    throw new Error(
      'Missing required environment variable: DOI_IDENTITY_PUBLIC_KEY or DOI_IDENTITY_SECRET'
    );
  }

  return {
    issuer,
    audience,
    publicKey,
    secret,
    algorithm: publicKey ? 'RS256' : 'HS256',
  };
}
