// Note: PAWS API integration will be completed in Epic 3 when deploying ECS service
// For now, we create a simple cache interface that matches PAWS API

// TODO: Import from @doi-do/lambda-api-core when available
// import { CacheWrapper } from '@doi-do/lambda-api-core/infrastructure/cache/cache-wrapper';
// import { createCacheWrapper } from '@doi-do/lambda-api-core/infrastructure/cache/cache-factory';
// import { cacheKey } from '@doi-do/lambda-api-core/infrastructure/cache/cache-key';

import type { GeoFeature } from '../models/geo-feature';
import type { Geometry } from 'geojson';

// Temporary stub types until we integrate PAWS API
type CacheWrapper = any;
function cacheKey(...parts: string[]): string {
  return parts.join(':');
}
async function createCacheWrapper(_config?: any): Promise<CacheWrapper | undefined> {
  return undefined; // No caching yet
}

/**
 * Cache TTL configuration for different entity types (milliseconds)
 */
export const CACHE_TTL = {
  /** Individual feature cache: 5 minutes */
  FEATURE: 5 * 60 * 1000,

  /** Feature list cache: 1 minute (lists change frequently) */
  FEATURE_LIST: 1 * 60 * 1000,

  /** Tile cache: 15 minutes (tiles are expensive to generate) */
  TILE: 15 * 60 * 1000,

  /** Authorization cache: 1 minute (permissions can change) */
  AUTH: 1 * 60 * 1000,

  /** Bureau metadata: 1 hour (rarely changes) */
  BUREAU: 60 * 60 * 1000,

  /** User group membership: 5 minutes */
  GROUP_MEMBERSHIP: 5 * 60 * 1000,
} as const;

/**
 * GeoServices cache manager
 *
 * Wraps PAWS API CacheWrapper with geo-specific cache strategies
 */
export class GeoCacheManager {
  private cache?: CacheWrapper;

  private constructor(cache?: CacheWrapper) {
    this.cache = cache;
  }

  /**
   * Initialize cache manager
   * Call this once at application startup
   */
  static async create(): Promise<GeoCacheManager> {
    const cache = await createCacheWrapper({
      keyPrefix: 'geo', // Override PAWS prefix
      ttlMs: CACHE_TTL.FEATURE, // Default TTL
      slidingExpiration: false, // Use absolute expiration by default
    });

    return new GeoCacheManager(cache);
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.cache !== undefined;
  }

  // ========================================================================
  // FEATURE CACHING
  // ========================================================================

  /**
   * Get cached feature by ID
   */
  async getFeature(featureId: string): Promise<GeoFeature | undefined> {
    if (!this.cache) return undefined;

    const key = cacheKey('feature', featureId);
    return (this.cache as any).get(key);
  }

  /**
   * Cache a feature
   */
  async setFeature(feature: GeoFeature): Promise<void> {
    if (!this.cache) return;

    const key = cacheKey('feature', feature.id);
    await this.cache.set(key, feature, CACHE_TTL.FEATURE);
  }

  /**
   * Invalidate feature cache
   */
  async invalidateFeature(featureId: string): Promise<void> {
    if (!this.cache) return;

    const key = cacheKey('feature', featureId);
    await this.cache.del(key);
  }

  /**
   * Get or fetch feature with cache-aside pattern
   *
   * @param featureId - Feature ID
   * @param fetcher - Function to fetch from database if not cached
   * @returns Cached or fetched feature
   */
  async wrapFeature(
    featureId: string,
    fetcher: () => Promise<GeoFeature | undefined>
  ): Promise<GeoFeature | undefined> {
    if (!this.cache) return fetcher();

    const key = cacheKey('feature', featureId);
    return this.cache.wrap(key, fetcher, CACHE_TTL.FEATURE, { tag: 'feature' });
  }

  // ========================================================================
  // FEATURE LIST CACHING
  // ========================================================================

  /**
   * Get cached feature list
   *
   * @param bureauId - Bureau ID
   * @param filters - Stringified filter object
   * @returns Cached feature list or undefined
   */
  async getFeatureList(bureauId: string, filters: string): Promise<GeoFeature[] | undefined> {
    if (!this.cache) return undefined;

    const key = cacheKey('features', bureauId, filters);
    return (this.cache as any).get(key);
  }

  /**
   * Cache feature list
   */
  async setFeatureList(bureauId: string, filters: string, features: GeoFeature[]): Promise<void> {
    if (!this.cache) return;

    const key = cacheKey('features', bureauId, filters);
    await this.cache.set(key, features, CACHE_TTL.FEATURE_LIST);
  }

  /**
   * Invalidate all feature lists for a bureau
   *
   * Use pattern matching to delete all list caches
   */
  async invalidateFeatureLists(_bureauId: string): Promise<void> {
    if (!this.cache) return;

    // Note: Pattern deletion requires Redis SCAN command
    // For now, we'll rely on short TTL (1 min) for lists
    // TODO: Implement pattern deletion in Epic 3
  }

  // ========================================================================
  // TILE CACHING
  // ========================================================================

  /**
   * Get cached tile
   *
   * @param z - Zoom level
   * @param x - Tile X coordinate
   * @param y - Tile Y coordinate
   * @param bureauId - Bureau ID (for multi-tenancy)
   * @returns Cached tile buffer or undefined
   */
  async getTile(z: number, x: number, y: number, bureauId: string): Promise<Buffer | undefined> {
    if (!this.cache) return undefined;

    const key = cacheKey('tile', `${z}:${x}:${y}:${bureauId}`);
    return (this.cache as any).get(key);
  }

  /**
   * Cache a tile
   */
  async setTile(z: number, x: number, y: number, bureauId: string, tile: Buffer): Promise<void> {
    if (!this.cache) return;

    const key = cacheKey('tile', `${z}:${x}:${y}:${bureauId}`);
    await this.cache.set(key, tile, CACHE_TTL.TILE);
  }

  /**
   * Wrap tile fetcher with cache
   */
  async wrapTile(
    z: number,
    x: number,
    y: number,
    bureauId: string,
    fetcher: () => Promise<Buffer>
  ): Promise<Buffer> {
    if (!this.cache) return fetcher();

    const key = cacheKey('tile', `${z}:${x}:${y}:${bureauId}`);
    return this.cache.wrap(key, fetcher, CACHE_TTL.TILE, { tag: 'tile' });
  }

  /**
   * Invalidate tiles that intersect with a bounding box
   *
   * Called when a feature is updated/deleted
   *
   * @param bounds - GeoJSON bounding box [minLon, minLat, maxLon, maxLat]
   * @param bureauId - Bureau ID
   * @param zoomLevels - Zoom levels to invalidate (default: 10-14)
   */
  async invalidateTilesInBounds(
    bounds: [number, number, number, number],
    bureauId: string,
    zoomLevels: number[] = [10, 11, 12, 13, 14]
  ): Promise<void> {
    if (!this.cache) return;

    // Calculate affected tiles
    const tiles = getTileRangeForBounds(bounds, zoomLevels);

    // Delete all affected tiles
    const deletePromises = tiles.map(({ z, x, y }) => {
      const key = cacheKey('tile', `${z}:${x}:${y}:${bureauId}`);
      return this.cache!.del(key);
    });

    await Promise.all(deletePromises);
  }

  // ========================================================================
  // AUTHORIZATION CACHING
  // ========================================================================

  /**
   * Get cached authorization result
   *
   * @param userId - User ID
   * @param featureId - Feature ID
   * @param permission - Permission type
   * @returns Cached authorization result or undefined
   */
  async getAuth(userId: string, featureId: string, permission: string): Promise<boolean | undefined> {
    if (!this.cache) return undefined;

    const key = cacheKey('auth', `${userId}:${featureId}:${permission}`);
    return (this.cache as any).get(key);
  }

  /**
   * Cache authorization result
   */
  async setAuth(userId: string, featureId: string, permission: string, allowed: boolean): Promise<void> {
    if (!this.cache) return;

    const key = cacheKey('auth', `${userId}:${featureId}:${permission}`);
    await this.cache.set(key, allowed, CACHE_TTL.AUTH);
  }

  /**
   * Wrap authorization check with cache
   */
  async wrapAuth(
    userId: string,
    featureId: string,
    permission: string,
    checker: () => Promise<boolean>
  ): Promise<boolean> {
    if (!this.cache) return checker();

    const key = cacheKey('auth', `${userId}:${featureId}:${permission}`);
    return this.cache.wrap(key, checker, CACHE_TTL.AUTH, { tag: 'auth' });
  }

  /**
   * Invalidate authorization cache for a feature
   *
   * Called when feature ownership changes
   */
  async invalidateAuthForFeature(_featureId: string): Promise<void> {
    if (!this.cache) return;

    // Note: Pattern deletion requires Redis SCAN
    // For now, rely on short TTL (1 min)
    // TODO: Implement pattern deletion in Epic 3
  }

  // ========================================================================
  // BUREAU/GROUP CACHING
  // ========================================================================

  /**
   * Wrap bureau fetcher with cache (long TTL)
   */
  async wrapBureau<T>(bureauId: string, fetcher: () => Promise<T>): Promise<T> {
    if (!this.cache) return fetcher();

    const key = cacheKey('bureau', bureauId);
    return this.cache.wrap(key, fetcher, CACHE_TTL.BUREAU, { tag: 'bureau' });
  }

  /**
   * Wrap group membership fetcher with cache
   */
  async wrapGroupMembership<T>(userId: string, fetcher: () => Promise<T>): Promise<T> {
    if (!this.cache) return fetcher();

    const key = cacheKey('group-membership', userId);
    return this.cache.wrap(key, fetcher, CACHE_TTL.GROUP_MEMBERSHIP, { tag: 'group' });
  }

  // ========================================================================
  // CACHE INVALIDATION STRATEGIES
  // ========================================================================

  /**
   * Invalidate all caches related to a feature update
   *
   * Call this when a feature is created, updated, or deleted
   *
   * @param feature - Updated feature
   * @param oldBounds - Old bounding box (for updates)
   */
  async invalidateFeatureUpdate(
    feature: GeoFeature,
    oldBounds?: [number, number, number, number]
  ): Promise<void> {
    if (!this.cache) return;

    // Invalidate feature cache
    await this.invalidateFeature(feature.id);

    // Invalidate feature lists for the bureau
    await this.invalidateFeatureLists(feature.bureauId);

    // Invalidate tiles
    const bounds = getFeatureBounds(feature.geometry);
    if (bounds) {
      await this.invalidateTilesInBounds(bounds, feature.bureauId);
    }

    // If bounds changed (update), also invalidate old bounds
    if (oldBounds) {
      await this.invalidateTilesInBounds(oldBounds, feature.bureauId);
    }

    // Invalidate auth cache
    await this.invalidateAuthForFeature(feature.id);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate tile range for a bounding box at given zoom levels
 *
 * @param bounds - [minLon, minLat, maxLon, maxLat]
 * @param zoomLevels - Zoom levels to calculate
 * @returns Array of tile coordinates
 */
function getTileRangeForBounds(
  bounds: [number, number, number, number],
  zoomLevels: number[]
): Array<{ z: number; x: number; y: number }> {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const tiles: Array<{ z: number; x: number; y: number }> = [];

  for (const z of zoomLevels) {
    const minTile = lonLatToTile(minLon, maxLat, z); // Note: lat is inverted
    const maxTile = lonLatToTile(maxLon, minLat, z);

    // Add all tiles in range (limit to 100 tiles per zoom to avoid explosion)
    const maxTilesPerZoom = 100;
    let tileCount = 0;

    for (let x = minTile.x; x <= maxTile.x && tileCount < maxTilesPerZoom; x++) {
      for (let y = minTile.y; y <= maxTile.y && tileCount < maxTilesPerZoom; y++) {
        tiles.push({ z, x, y });
        tileCount++;
      }
    }
  }

  return tiles;
}

/**
 * Convert lon/lat to tile coordinates
 */
function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/**
 * Get bounding box for a GeoJSON geometry
 *
 * @param geometry - GeoJSON geometry
 * @returns [minLon, minLat, maxLon, maxLat] or undefined
 */
function getFeatureBounds(geometry: Geometry): [number, number, number, number] | undefined {
  // This is a simplified implementation
  // In production, use @turf/bbox for accurate calculation
  // TODO: Use @turf/bbox in Epic 2 utilities

  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    // Add small buffer around point
    const buffer = 0.001; // ~100 meters
    return [lon - buffer, lat - buffer, lon + buffer, lat + buffer];
  }

  // For other geometry types, return undefined for now
  // Will implement with @turf/bbox in utilities
  return undefined;
}

/**
 * Singleton cache manager instance
 */
let cacheManager: GeoCacheManager | undefined;

/**
 * Get or create the shared cache manager
 */
export async function getCacheManager(): Promise<GeoCacheManager> {
  if (!cacheManager) {
    cacheManager = await GeoCacheManager.create();
  }
  return cacheManager;
}

/**
 * Reset cache manager (for testing)
 */
export function resetCacheManager(): void {
  cacheManager = undefined;
}
