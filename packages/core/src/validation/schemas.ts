import { z } from 'zod';

/**
 * GeoJSON validation schemas
 *
 * Based on GeoJSON specification (RFC 7946)
 */

// GeoJSON Position: [longitude, latitude] or [longitude, latitude, elevation]
const positionSchema = z.tuple([z.number(), z.number()]).or(z.tuple([z.number(), z.number(), z.number()]));

// GeoJSON Point
const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
});

// GeoJSON MultiPoint
const multiPointSchema = z.object({
  type: z.literal('MultiPoint'),
  coordinates: z.array(positionSchema),
});

// GeoJSON LineString
const lineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(positionSchema).min(2),
});

// GeoJSON MultiLineString
const multiLineStringSchema = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(positionSchema).min(2)),
});

// GeoJSON Polygon
const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(positionSchema).min(4)), // Closed ring with at least 4 points
});

// GeoJSON MultiPolygon
const multiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(positionSchema).min(4))),
});

// GeoJSON Geometry (union of all geometry types)
export const geometrySchema = z.discriminatedUnion('type', [
  pointSchema,
  multiPointSchema,
  lineStringSchema,
  multiLineStringSchema,
  polygonSchema,
  multiPolygonSchema,
]);

/**
 * Create GeoFeature request schema
 */
export const createGeoFeatureSchema = z.object({
  geometry: geometrySchema,
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  properties: z.record(z.unknown()).optional().default({}),
  bureauId: z.string().min(1),
  ownerId: z.string().min(1),
  ownerType: z.enum(['user', 'group']),
});

/**
 * Update GeoFeature request schema
 */
export const updateGeoFeatureSchema = z.object({
  geometry: geometrySchema.optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  properties: z.record(z.unknown()).optional(),
});

/**
 * Bounding box schema
 */
export const boundingBoxSchema = z.object({
  minLon: z.number().min(-180).max(180),
  minLat: z.number().min(-90).max(90),
  maxLon: z.number().min(-180).max(180),
  maxLat: z.number().min(-90).max(90),
});

/**
 * Spatial query schema
 */
export const spatialQuerySchema = z.object({
  bbox: boundingBoxSchema.optional(),
  within: z
    .object({
      point: pointSchema,
      radiusMeters: z.number().positive().max(100000), // Max 100km radius
    })
    .optional(),
  intersects: geometrySchema.optional(),
  contains: geometrySchema.optional(),
});

/**
 * List features query parameters schema
 */
export const listFeaturesQuerySchema = z.object({
  bureauId: z.string().optional(),
  ownerId: z.string().optional(),
  ownerType: z.enum(['user', 'group']).optional(),
  spatial: spatialQuerySchema.optional(),
  properties: z.record(z.unknown()).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

/**
 * Bureau schema
 */
export const createBureauSchema = z.object({
  id: z.string().min(2).max(10).regex(/^[a-z]+$/), // e.g., 'nps', 'blm'
  name: z.string().min(1).max(255),
  abbreviation: z.string().min(2).max(10).toUpperCase(),
  description: z.string().max(1000).optional(),
});

/**
 * User group schema
 */
export const createUserGroupSchema = z.object({
  name: z.string().min(1).max(255),
  bureauId: z.string().min(1),
  description: z.string().max(1000).optional(),
});

/**
 * Group member schema
 */
export const addGroupMemberSchema = z.object({
  groupId: z.string().uuid(),
  userId: z.string().min(1),
  role: z.enum(['member', 'admin']).default('member'),
});

/**
 * Tile request parameters schema
 */
export const tileParamsSchema = z.object({
  z: z.coerce.number().int().min(0).max(20),
  x: z.coerce.number().int().nonnegative(),
  y: z.coerce.number().int().nonnegative(),
  bureauId: z.string().optional(), // Optional bureau filter
});

/**
 * Type inference helpers
 */
export type CreateGeoFeatureInput = z.infer<typeof createGeoFeatureSchema>;
export type UpdateGeoFeatureInput = z.infer<typeof updateGeoFeatureSchema>;
export type ListFeaturesQuery = z.infer<typeof listFeaturesQuerySchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type SpatialQuery = z.infer<typeof spatialQuerySchema>;
export type CreateBureauInput = z.infer<typeof createBureauSchema>;
export type CreateUserGroupInput = z.infer<typeof createUserGroupSchema>;
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;
export type TileParams = z.infer<typeof tileParamsSchema>;

/**
 * Validation helper: parse and validate input
 *
 * @param schema - Zod schema
 * @param input - Input data
 * @returns Parsed and validated data
 * @throws ZodError if validation fails
 */
export function validate<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  return schema.parse(input);
}

/**
 * Validation helper: safe parse (returns result object)
 *
 * @param schema - Zod schema
 * @param input - Input data
 * @returns Result object with success flag and data/error
 */
export function validateSafe<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): z.SafeParseReturnType<unknown, z.infer<T>> {
  return schema.safeParse(input);
}
