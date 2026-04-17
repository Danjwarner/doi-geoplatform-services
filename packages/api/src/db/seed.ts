/**
 * Database seed script
 *
 * Seeds the database with:
 * - DOI bureaus
 * - Sample user groups
 * - Sample geo features (national parks, monuments, etc.)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { bureaus, userGroups, geoFeatures } from './schema.js';
import { getLogger } from '@doi/geoservices-core/utils';

const logger = getLogger('seed');

/**
 * DOI Bureau seed data
 */
const bureauData = [
  {
    id: 'nps',
    name: 'National Park Service',
    abbreviation: 'NPS',
    description: 'Protects and manages national parks, monuments, and historic sites',
  },
  {
    id: 'blm',
    name: 'Bureau of Land Management',
    abbreviation: 'BLM',
    description: 'Manages public lands for multiple uses including energy, grazing, and recreation',
  },
  {
    id: 'fws',
    name: 'U.S. Fish and Wildlife Service',
    abbreviation: 'FWS',
    description: 'Conserves and protects fish, wildlife, plants, and their habitats',
  },
  {
    id: 'usgs',
    name: 'U.S. Geological Survey',
    abbreviation: 'USGS',
    description: 'Provides science about natural hazards, resources, ecosystems, and climate',
  },
  {
    id: 'bor',
    name: 'Bureau of Reclamation',
    abbreviation: 'BOR',
    description: 'Manages water resources in the western United States',
  },
  {
    id: 'osmre',
    name: 'Office of Surface Mining Reclamation and Enforcement',
    abbreviation: 'OSMRE',
    description: 'Regulates coal mining and reclamation',
  },
  {
    id: 'bsee',
    name: 'Bureau of Safety and Environmental Enforcement',
    abbreviation: 'BSEE',
    description: 'Promotes safety and environmental protection in offshore energy',
  },
  {
    id: 'boem',
    name: 'Bureau of Ocean Energy Management',
    abbreviation: 'BOEM',
    description: 'Manages offshore energy and mineral resources',
  },
  {
    id: 'bia',
    name: 'Bureau of Indian Affairs',
    abbreviation: 'BIA',
    description: 'Provides services to federally recognized tribes',
  },
];

/**
 * Sample user groups
 */
const userGroupData = [
  {
    name: 'NPS GIS Team',
    bureauId: 'nps',
    description: 'National Park Service GIS and mapping staff',
  },
  {
    name: 'BLM Field Offices',
    bureauId: 'blm',
    description: 'BLM regional field office staff',
  },
  {
    name: 'FWS Biologists',
    bureauId: 'fws',
    description: 'Fish and Wildlife Service field biologists',
  },
  {
    name: 'USGS Research Team',
    bureauId: 'usgs',
    description: 'USGS scientists and researchers',
  },
];

/**
 * Sample geo features (famous National Parks)
 */
const geoFeatureData = [
  {
    name: 'Yellowstone National Park',
    description: 'First national park in the world, known for geothermal features and wildlife',
    geometry: {
      type: 'Point' as const,
      coordinates: [-110.5885, 44.4280],
    },
    properties: {
      established: '1872-03-01',
      area_sq_miles: 3472,
      state: 'Wyoming, Montana, Idaho',
      visitors_2023: 4500000,
      features: ['Old Faithful', 'Grand Prismatic Spring', 'Yellowstone Lake'],
    },
    bureauId: 'nps',
    ownerId: 'system',
    ownerType: 'user' as const,
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    name: 'Grand Canyon National Park',
    description: 'Iconic canyon carved by the Colorado River',
    geometry: {
      type: 'Point' as const,
      coordinates: [-112.1401, 36.0544],
    },
    properties: {
      established: '1919-02-26',
      area_sq_miles: 1904,
      state: 'Arizona',
      visitors_2023: 4700000,
      features: ['South Rim', 'North Rim', 'Colorado River'],
      depth_feet: 6093,
    },
    bureauId: 'nps',
    ownerId: 'system',
    ownerType: 'user' as const,
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    name: 'Yosemite National Park',
    description: 'Famous for granite cliffs, waterfalls, and giant sequoias',
    geometry: {
      type: 'Point' as const,
      coordinates: [-119.5383, 37.8651],
    },
    properties: {
      established: '1890-10-01',
      area_sq_miles: 1187,
      state: 'California',
      visitors_2023: 3900000,
      features: ['Half Dome', 'El Capitan', 'Yosemite Falls'],
      elevation_feet: 11914,
    },
    bureauId: 'nps',
    ownerId: 'system',
    ownerType: 'user' as const,
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    name: 'Zion National Park',
    description: 'Red rock canyons and dramatic cliff walls',
    geometry: {
      type: 'Point' as const,
      coordinates: [-113.0263, 37.2982],
    },
    properties: {
      established: '1919-11-19',
      area_sq_miles: 229,
      state: 'Utah',
      visitors_2023: 4600000,
      features: ['Angels Landing', 'The Narrows', 'Court of the Patriarchs'],
    },
    bureauId: 'nps',
    ownerId: 'system',
    ownerType: 'user' as const,
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    name: 'Glacier National Park',
    description: 'Pristine forests, alpine meadows, and rugged mountains',
    geometry: {
      type: 'Point' as const,
      coordinates: [-113.7870, 48.7596],
    },
    properties: {
      established: '1910-05-11',
      area_sq_miles: 1583,
      state: 'Montana',
      visitors_2023: 3000000,
      features: ['Going-to-the-Sun Road', 'Many Glacier', 'Lake McDonald'],
      glaciers: 25,
    },
    bureauId: 'nps',
    ownerId: 'system',
    ownerType: 'user' as const,
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    name: 'Arctic National Wildlife Refuge',
    description: 'Largest wildlife refuge in the United States',
    geometry: {
      type: 'Point' as const,
      coordinates: [-145.0, 69.5],
    },
    properties: {
      established: '1960-12-06',
      area_sq_miles: 30136,
      state: 'Alaska',
      features: ['Coastal Plain', 'Brooks Range', 'Porcupine Caribou Herd'],
      wildlife: ['Polar bears', 'Caribou', 'Muskoxen', 'Arctic foxes'],
    },
    bureauId: 'fws',
    ownerId: 'system',
    ownerType: 'user' as const,
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
  {
    name: 'Red Rock Canyon National Conservation Area',
    description: 'BLM-managed area with striking red rock formations near Las Vegas',
    geometry: {
      type: 'Point' as const,
      coordinates: [-115.4278, 36.1347],
    },
    properties: {
      established: '1990-11-16',
      area_sq_miles: 195,
      state: 'Nevada',
      visitors_2023: 2000000,
      features: ['Calico Hills', 'Keystone Thrust', 'Scenic Drive'],
      climbing_routes: 2000,
    },
    bureauId: 'blm',
    ownerId: 'system',
    ownerType: 'user' as const,
    createdBy: 'seed-script',
    updatedBy: 'seed-script',
  },
];

/**
 * Seed database
 */
async function seed() {
  logger.info('Starting database seed...');

  // Create connection
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'geoservices',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const db = drizzle(pool);

  try {
    // 1. Seed bureaus
    logger.info('Seeding bureaus...');
    await db.insert(bureaus).values(bureauData).onConflictDoNothing();
    logger.info(`Seeded ${bureauData.length} bureaus`);

    // 2. Seed user groups
    logger.info('Seeding user groups...');
    const insertedGroups = await db.insert(userGroups).values(userGroupData).returning();
    logger.info(`Seeded ${insertedGroups.length} user groups`);

    // 3. Seed geo features
    logger.info('Seeding geo features...');
    await db.insert(geoFeatures).values(geoFeatureData as any).onConflictDoNothing();
    logger.info(`Seeded ${geoFeatureData.length} geo features`);

    logger.info('Database seed completed successfully!');
  } catch (error) {
    logger.error({ error }, 'Database seed failed');
    throw error;
  } finally {
    await pool.end();
  }
}

// Run seed if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => {
      logger.info('Seed script finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Seed script failed');
      process.exit(1);
    });
}

export { seed };
