import * as turf from '@turf/turf';
import type { Geometry, Point, LineString, MultiLineString, Polygon } from 'geojson';

/**
 * Geometry utility functions using Turf.js
 */

/**
 * Calculate bounding box for a GeoJSON geometry
 *
 * @param geometry - GeoJSON geometry
 * @returns [minLon, minLat, maxLon, maxLat]
 */
export function getBoundingBox(geometry: Geometry): [number, number, number, number] {
  return turf.bbox(geometry) as [number, number, number, number];
}

/**
 * Calculate area of a geometry in square meters
 *
 * @param geometry - GeoJSON geometry
 * @returns Area in square meters
 */
export function getArea(geometry: Geometry): number {
  return turf.area(geometry);
}

/**
 * Calculate length of a line geometry in meters
 *
 * @param geometry - GeoJSON LineString or MultiLineString
 * @returns Length in meters
 */
export function getLength(geometry: LineString | MultiLineString): number {
  return turf.length(turf.feature(geometry), { units: 'meters' });
}

/**
 * Calculate centroid of a geometry
 *
 * @param geometry - GeoJSON geometry
 * @returns Point geometry representing the centroid
 */
export function getCentroid(geometry: Geometry): Point {
  return turf.centroid(geometry).geometry;
}

/**
 * Check if a point is within a polygon
 *
 * @param point - Point geometry
 * @param polygon - Polygon geometry
 * @returns true if point is inside polygon
 */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  return turf.booleanPointInPolygon(point, polygon);
}

/**
 * Check if two geometries intersect
 *
 * @param geometry1 - First geometry
 * @param geometry2 - Second geometry
 * @returns true if geometries intersect
 */
export function intersects(geometry1: Geometry, geometry2: Geometry): boolean {
  return turf.booleanIntersects(geometry1, geometry2);
}

/**
 * Check if geometry1 contains geometry2
 *
 * @param geometry1 - Container geometry
 * @param geometry2 - Contained geometry
 * @returns true if geometry1 fully contains geometry2
 */
export function contains(geometry1: Geometry, geometry2: Geometry): boolean {
  return turf.booleanContains(geometry1, geometry2);
}

/**
 * Calculate distance between two points in meters
 *
 * @param point1 - First point
 * @param point2 - Second point
 * @returns Distance in meters
 */
export function distance(point1: Point, point2: Point): number {
  return turf.distance(point1, point2, { units: 'meters' });
}

/**
 * Create a buffer around a geometry
 *
 * @param geometry - Input geometry
 * @param radiusMeters - Buffer radius in meters
 * @returns Buffered polygon geometry
 */
export function buffer(geometry: Geometry, radiusMeters: number): Polygon | undefined {
  const radiusKm = radiusMeters / 1000;
  const result = turf.buffer(turf.feature(geometry), radiusKm, { units: 'kilometers' });
  return result?.geometry as Polygon | undefined;
}

/**
 * Simplify a geometry (reduce number of vertices)
 *
 * @param geometry - Input geometry
 * @param tolerance - Simplification tolerance (0-1, higher = more simplification)
 * @returns Simplified geometry
 */
export function simplify(geometry: Geometry, tolerance = 0.01): Geometry {
  const feature = turf.feature(geometry);
  return turf.simplify(feature, { tolerance, highQuality: false }).geometry;
}

/**
 * Validate GeoJSON geometry
 *
 * @param geometry - GeoJSON geometry
 * @returns true if geometry is valid
 */
export function isValidGeometry(geometry: unknown): geometry is Geometry {
  try {
    if (!geometry || typeof geometry !== 'object') return false;

    const geom = geometry as Geometry;

    // Check for valid geometry type
    const validTypes = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'];
    if (!validTypes.includes(geom.type)) return false;

    // Check for coordinates
    if (!('coordinates' in geom) || !Array.isArray(geom.coordinates)) return false;

    // Basic validation passed
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert bounding box to polygon geometry
 *
 * @param bbox - [minLon, minLat, maxLon, maxLat]
 * @returns Polygon geometry
 */
export function bboxToPolygon(bbox: [number, number, number, number]): Polygon {
  return turf.bboxPolygon(bbox).geometry;
}

/**
 * Create a point geometry from lon/lat
 *
 * @param longitude - Longitude (-180 to 180)
 * @param latitude - Latitude (-90 to 90)
 * @returns Point geometry
 */
export function createPoint(longitude: number, latitude: number): Point {
  return turf.point([longitude, latitude]).geometry;
}

/**
 * Parse GeoJSON from string
 *
 * @param geojson - GeoJSON string
 * @returns Parsed GeoJSON geometry
 * @throws Error if invalid JSON or GeoJSON
 */
export function parseGeoJSON(geojson: string): Geometry {
  const parsed = JSON.parse(geojson);

  if (!isValidGeometry(parsed)) {
    throw new Error('Invalid GeoJSON geometry');
  }

  return parsed;
}

/**
 * Convert geometry to WKT (Well-Known Text) format
 *
 * Useful for PostGIS ST_GeomFromText
 *
 * @param geometry - GeoJSON geometry
 * @returns WKT string
 */
export function toWKT(geometry: Geometry): string {
  // Simple WKT conversion for common types
  // For production, consider using a dedicated WKT library

  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    return `POINT(${lon} ${lat})`;
  }

  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
    return `LINESTRING(${coords})`;
  }

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates
      .map((ring) => {
        const coords = ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
        return `(${coords})`;
      })
      .join(', ');
    return `POLYGON(${rings})`;
  }

  // For other types, return GeoJSON string (PostGIS supports it)
  return JSON.stringify(geometry);
}
