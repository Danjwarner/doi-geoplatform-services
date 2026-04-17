import { eq, and, sql, SQL, desc, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { geoFeatures, type GeoFeature } from '../db/schema.js';
import type { Geometry, Point } from 'geojson';

/**
 * Spatial query options
 */
export interface SpatialQuery {
  /** Bounding box [minLon, minLat, maxLon, maxLat] */
  bbox?: [number, number, number, number];
  /** Radius search: center point */
  center?: Point;
  /** Radius search: distance in meters */
  radiusMeters?: number;
  /** Geometry intersection */
  intersects?: Geometry;
  /** Geometry contains point */
  contains?: Point;
}

/**
 * Query filters
 */
export interface FeatureFilters {
  /** Filter by bureau ID */
  bureauId?: string;
  /** Filter by owner ID */
  ownerId?: string;
  /** Filter by owner type */
  ownerType?: 'user' | 'group';
  /** Filter by name (case-insensitive contains) */
  nameContains?: string;
  /** Filter by properties (JSONB query) */
  properties?: Record<string, unknown>;
  /** Spatial query */
  spatial?: SpatialQuery;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  /** Page number (1-indexed) */
  page?: number;
  /** Page size (default: 50, max: 500) */
  limit?: number;
  /** Sort field */
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  /** Sort direction */
  sortDir?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * GeoFeature repository with spatial query support
 */
export class GeoFeatureRepository {
  constructor(private db: NodePgDatabase<any>) {}

  // ========================================================================
  // CRUD OPERATIONS
  // ========================================================================

  /**
   * Create a new feature
   */
  async create(feature: Omit<GeoFeature, 'id' | 'createdAt' | 'updatedAt'>): Promise<GeoFeature> {
    const [created] = await this.db
      .insert(geoFeatures)
      .values(feature as any) // Type assertion for custom geometry type
      .returning();

    return created;
  }

  /**
   * Get feature by ID
   */
  async findById(id: string): Promise<GeoFeature | undefined> {
    const [feature] = await this.db
      .select()
      .from(geoFeatures)
      .where(eq(geoFeatures.id, id))
      .limit(1);

    return feature;
  }

  /**
   * Update feature
   */
  async update(id: string, updates: Partial<Omit<GeoFeature, 'id' | 'createdAt' | 'updatedAt'>>): Promise<GeoFeature | undefined> {
    const [updated] = await this.db
      .update(geoFeatures)
      .set({
        ...updates,
        geometry: updates.geometry ? (updates.geometry as any) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(geoFeatures.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete feature
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(geoFeatures).where(eq(geoFeatures.id, id));

    return result.rowCount ? result.rowCount > 0 : false;
  }

  // ========================================================================
  // QUERY OPERATIONS
  // ========================================================================

  /**
   * Find features with filters and pagination
   */
  async find(
    filters: FeatureFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GeoFeature>> {
    // Pagination defaults
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(500, Math.max(1, pagination.limit || 50));
    const offset = (page - 1) * limit;
    const sortBy = pagination.sortBy || 'createdAt';
    const sortDir = pagination.sortDir || 'desc';

    // Build WHERE conditions
    const conditions = this.buildWhereConditions(filters);

    // Build ORDER BY
    const orderBy = this.buildOrderBy(sortBy, sortDir);

    // Execute query with pagination
    const data = await this.db
      .select()
      .from(geoFeatures)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Get total count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(geoFeatures)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Count features matching filters
   */
  async count(filters: FeatureFilters = {}): Promise<number> {
    const conditions = this.buildWhereConditions(filters);

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(geoFeatures)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result?.count || 0;
  }

  // ========================================================================
  // SPATIAL QUERIES
  // ========================================================================

  /**
   * Find features within bounding box
   */
  async findInBoundingBox(
    bbox: [number, number, number, number],
    filters: Omit<FeatureFilters, 'spatial'> = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GeoFeature>> {
    return this.find(
      {
        ...filters,
        spatial: { bbox },
      },
      pagination
    );
  }

  /**
   * Find features within radius of point
   */
  async findWithinRadius(
    center: Point,
    radiusMeters: number,
    filters: Omit<FeatureFilters, 'spatial'> = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GeoFeature>> {
    return this.find(
      {
        ...filters,
        spatial: { center, radiusMeters },
      },
      pagination
    );
  }

  /**
   * Find features intersecting with geometry
   */
  async findIntersecting(
    geometry: Geometry,
    filters: Omit<FeatureFilters, 'spatial'> = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<GeoFeature>> {
    return this.find(
      {
        ...filters,
        spatial: { intersects: geometry },
      },
      pagination
    );
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  /**
   * Build WHERE conditions from filters
   */
  private buildWhereConditions(filters: FeatureFilters): SQL[] {
    const conditions: SQL[] = [];

    // Bureau filter
    if (filters.bureauId) {
      conditions.push(eq(geoFeatures.bureauId, filters.bureauId));
    }

    // Owner filter
    if (filters.ownerId) {
      conditions.push(eq(geoFeatures.ownerId, filters.ownerId));
    }

    // Owner type filter
    if (filters.ownerType) {
      conditions.push(eq(geoFeatures.ownerType, filters.ownerType));
    }

    // Name contains (case-insensitive)
    if (filters.nameContains) {
      conditions.push(sql`${geoFeatures.name} ILIKE ${'%' + filters.nameContains + '%'}`);
    }

    // Properties JSONB query
    if (filters.properties) {
      for (const [key, value] of Object.entries(filters.properties)) {
        conditions.push(
          sql`${geoFeatures.properties}->>${key} = ${String(value)}`
        );
      }
    }

    // Spatial queries
    if (filters.spatial) {
      const spatial = filters.spatial;

      // Bounding box
      if (spatial.bbox) {
        const [minLon, minLat, maxLon, maxLat] = spatial.bbox;
        conditions.push(
          sql`ST_Intersects(
            ${geoFeatures.geometry},
            ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326)
          )`
        );
      }

      // Radius search
      if (spatial.center && spatial.radiusMeters) {
        const centerJson = JSON.stringify(spatial.center);
        conditions.push(
          sql`ST_DWithin(
            ${geoFeatures.geometry}::geography,
            ST_GeomFromGeoJSON(${centerJson})::geography,
            ${spatial.radiusMeters}
          )`
        );
      }

      // Intersection
      if (spatial.intersects) {
        const geomJson = JSON.stringify(spatial.intersects);
        conditions.push(
          sql`ST_Intersects(
            ${geoFeatures.geometry},
            ST_GeomFromGeoJSON(${geomJson})
          )`
        );
      }

      // Contains point
      if (spatial.contains) {
        const pointJson = JSON.stringify(spatial.contains);
        conditions.push(
          sql`ST_Contains(
            ${geoFeatures.geometry},
            ST_GeomFromGeoJSON(${pointJson})
          )`
        );
      }
    }

    return conditions;
  }

  /**
   * Build ORDER BY clause
   */
  private buildOrderBy(sortBy: string, sortDir: string): SQL {
    const column = sortBy === 'name'
      ? geoFeatures.name
      : sortBy === 'updatedAt'
      ? geoFeatures.updatedAt
      : geoFeatures.createdAt;

    return sortDir === 'asc' ? asc(column) : desc(column);
  }
}
