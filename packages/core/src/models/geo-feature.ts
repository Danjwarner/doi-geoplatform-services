import type { Geometry } from 'geojson';

/**
 * GeoFeature model
 * Represents a geographic feature with flexible properties
 */
export interface GeoFeature {
  id: string;
  geometry: Geometry;
  name: string;
  description?: string | null;
  properties: Record<string, unknown>;
  bureauId: string;
  ownerId: string;
  ownerType: 'user' | 'group';
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy?: string | null;
}

// Note: CreateGeoFeatureInput and UpdateGeoFeatureInput are now exported from validation/schemas.ts
// as zod-inferred types

/**
 * GeoFeature with computed distance (for proximity queries)
 */
export interface GeoFeatureWithDistance extends GeoFeature {
  distance: number; // meters
}

// Note: BoundingBox, SpatialQuery, and ListFeaturesQuery are now exported from validation/schemas.ts
// as zod-inferred types

/**
 * Paginated list response
 */
export interface PaginatedFeatures {
  features: GeoFeature[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
