/**
 * @doi/geoservices-core
 *
 * Shared core library for DOI GeoServices Platform
 *
 * Provides:
 * - Database schema and connection utilities (Drizzle ORM + PostGIS)
 * - DOI Identity authentication and authorization
 * - Multi-layer caching (PAWS API framework)
 * - GeoJSON validation (Zod)
 * - Geometry utilities (Turf.js)
 * - Structured logging (Pino)
 */

// Database
export * from './db';

// Models
export type { DoiUser, GeoFeatureWithDistance, PaginatedFeatures } from './models';

// Authentication & Authorization
export * from './auth';

// Caching
export * from './cache';

// Validation
export * from './validation';

// Utilities
export * from './utils';
