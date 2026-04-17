import { pgTable, uuid, text, jsonb, timestamp, index, pgEnum, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Geometry } from 'geojson';

/**
 * Custom PostGIS geometry type for Drizzle ORM
 *
 * Stores GeoJSON geometries in PostgreSQL using PostGIS geometry type
 * with SRID 4326 (WGS 84 - lat/long coordinates)
 */
export const geometry = customType<{
  data: Geometry;
  driverData: string;
  config: { srid?: number };
}>({
  dataType(config) {
    const srid = config?.srid ?? 4326;
    return `geometry(Geometry, ${srid})`;
  },
  toDriver(value: Geometry): string {
    // Convert GeoJSON to PostGIS format using ST_GeomFromGeoJSON
    return sql.raw(`ST_GeomFromGeoJSON('${JSON.stringify(value)}')`).queryChunks.join('');
  },
  fromDriver(value: unknown): Geometry {
    // PostGIS returns geometry as string, parse as GeoJSON
    if (typeof value === 'string') {
      return JSON.parse(value) as Geometry;
    }
    return value as Geometry;
  },
});

/**
 * Owner type enum (user or group)
 */
export const ownerTypeEnum = pgEnum('owner_type', ['user', 'group']);

/**
 * Main geo_features table
 *
 * Single table design with flexible JSONB properties.
 * Avoids Carto's table-per-dataset pattern.
 */
export const geoFeatures = pgTable(
  'geo_features',
  {
    // Primary key
    id: uuid('id').primaryKey().defaultRandom(),

    // Core geometry (PostGIS)
    geometry: geometry('geometry', { srid: 4326 }).notNull(),

    // Core attributes
    name: text('name').notNull(),
    description: text('description'),

    // Flexible properties (JSONB - indexed and queryable)
    properties: jsonb('properties').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),

    // Multi-tenancy: DOI bureau + ownership
    bureauId: text('bureau_id').notNull(),
    ownerId: text('owner_id').notNull(),
    ownerType: ownerTypeEnum('owner_type').notNull(),

    // Audit fields
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by'),
  },
  (table) => ({
    // Spatial index (GIST) - critical for fast spatial queries
    geometryIdx: index('idx_geometry').using('gist', sql`${table.geometry}`),

    // JSONB index (GIN) - enables fast property queries
    propertiesIdx: index('idx_properties').using('gin', table.properties),

    // Bureau index - for filtering by DOI bureau
    bureauIdx: index('idx_bureau').on(table.bureauId),

    // Owner index - for filtering by owner
    ownerIdx: index('idx_owner').on(table.ownerId, table.ownerType),

    // Updated index - for sorting by recency
    updatedIdx: index('idx_updated').on(table.updatedAt),

    // Full-text search index on name
    nameSearchIdx: index('idx_name_search').using(
      'gin',
      sql`to_tsvector('english', ${table.name})`
    ),
  })
);

/**
 * Bureaus table
 * DOI organizational units (e.g., NPS, BLM, FWS)
 */
export const bureaus = pgTable('bureaus', {
  id: text('id').primaryKey(), // e.g., 'nps', 'blm', 'fws'
  name: text('name').notNull(), // e.g., 'National Park Service'
  abbreviation: text('abbreviation').notNull(), // e.g., 'NPS'
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * User groups table
 * For group-based ownership
 */
export const userGroups = pgTable('user_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  bureauId: text('bureau_id')
    .notNull()
    .references(() => bureaus.id, { onDelete: 'cascade' }),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Group members table
 * Many-to-many relationship between users and groups
 */
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => userGroups.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // User ID from DOI Identity Server
    role: text('role').notNull().$type<'member' | 'admin'>(), // member or admin
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    addedBy: text('added_by').notNull(),
  },
  (table) => ({
    // Composite primary key
    pk: index('group_members_pkey').on(table.groupId, table.userId),
    // Index for looking up user's groups
    userIdx: index('idx_user_groups').on(table.userId),
  })
);

/**
 * Type exports for use in application code
 */
export type GeoFeature = typeof geoFeatures.$inferSelect;
export type NewGeoFeature = typeof geoFeatures.$inferInsert;
export type Bureau = typeof bureaus.$inferSelect;
export type NewBureau = typeof bureaus.$inferInsert;
export type UserGroup = typeof userGroups.$inferSelect;
export type NewUserGroup = typeof userGroups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;
