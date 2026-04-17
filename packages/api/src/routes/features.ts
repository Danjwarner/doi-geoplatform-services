import type { FastifyInstance } from 'fastify';
import { GeoFeatureRepository } from '../repositories/geo-feature-repository.js';
import { getUser } from '../middleware/auth.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/error-handler.js';
import {
  createGeoFeatureSchema,
  updateGeoFeatureSchema,
} from '@doi/geoservices-core/validation';
import type { z } from 'zod';

type CreateGeoFeatureInput = z.infer<typeof createGeoFeatureSchema>;
type UpdateGeoFeatureInput = z.infer<typeof updateGeoFeatureSchema>;
import { canAccessFeature } from '@doi/geoservices-core/auth';
import { getCacheManager } from '@doi/geoservices-core/cache';
import { getLogger } from '@doi/geoservices-core/utils';
import type { Point, Geometry } from 'geojson';

const logger = getLogger('features-routes');

/**
 * Feature routes
 */
export async function featureRoutes(fastify: FastifyInstance) {
  const repository = new GeoFeatureRepository(fastify.db);
  const cache = await getCacheManager();

  // ========================================================================
  // GET /features - List features with filters
  // ========================================================================

  fastify.get<{
    Querystring: {
      bureauId?: string;
      ownerId?: string;
      ownerType?: 'user' | 'group';
      nameContains?: string;
      page?: string;
      limit?: string;
      sortBy?: 'name' | 'createdAt' | 'updatedAt';
      sortDir?: 'asc' | 'desc';
      bbox?: string; // Format: "minLon,minLat,maxLon,maxLat"
    };
  }>('/features', async (request, reply) => {
    const user = getUser(request);
    const { bureauId, ownerId, ownerType, nameContains, page, limit, sortBy, sortDir, bbox } =
      request.query;

    // Validate bureau access
    const targetBureauId = bureauId || user.bureauId;
    if (!user.isCrossBureauAdmin && targetBureauId !== user.bureauId) {
      throw new ForbiddenError('Cannot access features from other bureaus');
    }

    // Parse bbox if provided
    let bboxArray: [number, number, number, number] | undefined;
    if (bbox) {
      const parts = bbox.split(',').map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) {
        throw new ValidationError('Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat');
      }
      bboxArray = parts as [number, number, number, number];
    }

    // Query features
    const result = await repository.find(
      {
        bureauId: targetBureauId,
        ownerId,
        ownerType,
        nameContains,
        spatial: bboxArray ? { bbox: bboxArray } : undefined,
      },
      {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        sortBy,
        sortDir,
      }
    );

    return reply.send(result);
  });

  // ========================================================================
  // GET /features/:id - Get feature by ID
  // ========================================================================

  fastify.get<{
    Params: { id: string };
  }>('/features/:id', async (request, reply) => {
    const user = getUser(request);
    const { id } = request.params;

    // Try cache first
    const feature = await cache.wrapFeature(id, async () => {
      return repository.findById(id);
    });

    if (!feature) {
      throw new NotFoundError(`Feature ${id} not found`);
    }

    // Check authorization (read permission)
    if (!canAccessFeature(user, feature, 'read')) {
      throw new ForbiddenError('Cannot access this feature');
    }

    return reply.send(feature);
  });

  // ========================================================================
  // POST /features - Create feature
  // ========================================================================

  fastify.post<{
    Body: CreateGeoFeatureInput;
  }>('/features', async (request, reply) => {
    const user = getUser(request);

    // Validate request body
    const data = createGeoFeatureSchema.parse(request.body);

    // Validate bureau access
    if (!user.isCrossBureauAdmin && data.bureauId !== user.bureauId) {
      throw new ForbiddenError('Cannot create features for other bureaus');
    }

    // Create feature
    const feature = await repository.create({
      ...data,
      description: data.description ?? null,
      createdBy: user.userId,
      updatedBy: user.userId,
    });

    logger.info(
      {
        featureId: feature.id,
        userId: user.userId,
        bureauId: feature.bureauId,
      },
      'Feature created'
    );

    // Cache the new feature
    await cache.setFeature(feature);

    return reply.code(201).send(feature);
  });

  // ========================================================================
  // PUT /features/:id - Update feature
  // ========================================================================

  fastify.put<{
    Params: { id: string };
    Body: UpdateGeoFeatureInput;
  }>('/features/:id', async (request, reply) => {
    const user = getUser(request);
    const { id } = request.params;

    // Validate request body
    const updates = updateGeoFeatureSchema.parse(request.body);

    // Get existing feature
    const existing = await repository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Feature ${id} not found`);
    }

    // Check authorization (write permission)
    if (!canAccessFeature(user, existing, 'write')) {
      throw new ForbiddenError('Cannot update this feature');
    }

    // Update feature
    const updated = await repository.update(id, updates);
    if (!updated) {
      throw new NotFoundError(`Feature ${id} not found after update`);
    }

    logger.info(
      {
        featureId: id,
        userId: user.userId,
      },
      'Feature updated'
    );

    // Invalidate cache
    await cache.invalidateFeatureUpdate(updated, existing.geometry.bbox as [number, number, number, number] | undefined);

    return reply.send(updated);
  });

  // ========================================================================
  // DELETE /features/:id - Delete feature
  // ========================================================================

  fastify.delete<{
    Params: { id: string };
  }>('/features/:id', async (request, reply) => {
    const user = getUser(request);
    const { id } = request.params;

    // Get existing feature
    const existing = await repository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Feature ${id} not found`);
    }

    // Check authorization (delete permission)
    if (!canAccessFeature(user, existing, 'delete')) {
      throw new ForbiddenError('Cannot delete this feature');
    }

    // Delete feature
    const deleted = await repository.delete(id);
    if (!deleted) {
      throw new NotFoundError(`Feature ${id} not found`);
    }

    logger.info(
      {
        featureId: id,
        userId: user.userId,
      },
      'Feature deleted'
    );

    // Invalidate cache
    await cache.invalidateFeatureUpdate(existing);

    return reply.code(204).send();
  });

  // ========================================================================
  // POST /features/search/bbox - Search features in bounding box
  // ========================================================================

  fastify.post<{
    Body: {
      bbox: [number, number, number, number];
      bureauId?: string;
      page?: number;
      limit?: number;
    };
  }>('/features/search/bbox', async (request, reply) => {
    const user = getUser(request);
    const { bbox, bureauId, page, limit } = request.body;

    // Validate bbox
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => typeof n !== 'number')) {
      throw new ValidationError('Invalid bbox. Expected: [minLon, minLat, maxLon, maxLat]');
    }

    // Validate bureau access
    const targetBureauId = bureauId || user.bureauId;
    if (!user.isCrossBureauAdmin && targetBureauId !== user.bureauId) {
      throw new ForbiddenError('Cannot search features from other bureaus');
    }

    // Search features
    const result = await repository.findInBoundingBox(
      bbox,
      { bureauId: targetBureauId },
      { page, limit }
    );

    return reply.send(result);
  });

  // ========================================================================
  // POST /features/search/radius - Search features within radius
  // ========================================================================

  fastify.post<{
    Body: {
      center: Point;
      radiusMeters: number;
      bureauId?: string;
      page?: number;
      limit?: number;
    };
  }>('/features/search/radius', async (request, reply) => {
    const user = getUser(request);
    const { center, radiusMeters, bureauId, page, limit } = request.body;

    // Validate inputs
    if (!center || center.type !== 'Point' || !Array.isArray(center.coordinates)) {
      throw new ValidationError('Invalid center point');
    }
    if (typeof radiusMeters !== 'number' || radiusMeters <= 0) {
      throw new ValidationError('radiusMeters must be a positive number');
    }

    // Validate bureau access
    const targetBureauId = bureauId || user.bureauId;
    if (!user.isCrossBureauAdmin && targetBureauId !== user.bureauId) {
      throw new ForbiddenError('Cannot search features from other bureaus');
    }

    // Search features
    const result = await repository.findWithinRadius(
      center,
      radiusMeters,
      { bureauId: targetBureauId },
      { page, limit }
    );

    return reply.send(result);
  });

  // ========================================================================
  // POST /features/search/intersects - Search features intersecting geometry
  // ========================================================================

  fastify.post<{
    Body: {
      geometry: Geometry;
      bureauId?: string;
      page?: number;
      limit?: number;
    };
  }>('/features/search/intersects', async (request, reply) => {
    const user = getUser(request);
    const { geometry, bureauId, page, limit } = request.body;

    // Validate geometry
    if (!geometry || !geometry.type) {
      throw new ValidationError('Invalid geometry');
    }

    // Validate bureau access
    const targetBureauId = bureauId || user.bureauId;
    if (!user.isCrossBureauAdmin && targetBureauId !== user.bureauId) {
      throw new ForbiddenError('Cannot search features from other bureaus');
    }

    // Search features
    const result = await repository.findIntersecting(
      geometry,
      { bureauId: targetBureauId },
      { page, limit }
    );

    return reply.send(result);
  });
}
