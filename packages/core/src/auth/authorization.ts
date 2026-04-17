import type { DoiUser } from '../models/user';
import type { GeoFeature } from '../models/geo-feature';

/**
 * Authorization error
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Permission type
 */
export type Permission = 'read' | 'write' | 'delete' | 'admin';

/**
 * Check if user can access a bureau
 *
 * Users can access their own bureau or all bureaus if cross-bureau admin
 *
 * @param user - DOI user
 * @param bureauId - Target bureau ID
 * @returns boolean - true if user has access
 */
export function canAccessBureau(user: DoiUser, bureauId: string): boolean {
  // Cross-bureau admins can access all bureaus
  if (user.isCrossBureauAdmin) {
    return true;
  }

  // Users can access their own bureau
  return user.bureauId === bureauId;
}

/**
 * Check if user can perform action on a feature
 *
 * Authorization rules:
 * 1. Cross-bureau admins can do anything
 * 2. Users can read features from their bureau
 * 3. Users can write/delete their own features (user ownership)
 * 4. Users can write/delete group features if they're in the group
 * 5. Group admins have elevated permissions
 *
 * @param user - DOI user
 * @param feature - Target feature
 * @param permission - Requested permission
 * @returns boolean - true if user has permission
 */
export function canAccessFeature(
  user: DoiUser,
  feature: Pick<GeoFeature, 'bureauId' | 'ownerId' | 'ownerType'>,
  permission: Permission
): boolean {
  // Cross-bureau admins can do anything
  if (user.isCrossBureauAdmin) {
    return true;
  }

  // Must be same bureau for any access
  if (feature.bureauId !== user.bureauId) {
    return false;
  }

  // Read permission: anyone in the bureau can read
  if (permission === 'read') {
    return true;
  }

  // Write/delete permission: must be owner or in owner group
  if (permission === 'write' || permission === 'delete') {
    // User ownership: must be the owner
    if (feature.ownerType === 'user') {
      return feature.ownerId === user.userId;
    }

    // Group ownership: must be in the group
    if (feature.ownerType === 'group') {
      return user.groups.includes(feature.ownerId);
    }
  }

  return false;
}

/**
 * Assert user can access bureau
 * Throws AuthorizationError if not authorized
 */
export function assertCanAccessBureau(user: DoiUser, bureauId: string): void {
  if (!canAccessBureau(user, bureauId)) {
    throw new AuthorizationError(
      `User ${user.userId} does not have access to bureau ${bureauId}`
    );
  }
}

/**
 * Assert user can access feature
 * Throws AuthorizationError if not authorized
 */
export function assertCanAccessFeature(
  user: DoiUser,
  feature: Pick<GeoFeature, 'bureauId' | 'ownerId' | 'ownerType'>,
  permission: Permission
): void {
  if (!canAccessFeature(user, feature, permission)) {
    throw new AuthorizationError(
      `User ${user.userId} does not have ${permission} permission for this feature`
    );
  }
}

/**
 * Check if user is group admin
 *
 * @param user - DOI user
 * @param groupId - Target group ID
 * @param groupMemberships - User's group memberships (from database)
 * @returns boolean - true if user is group admin
 */
export function isGroupAdmin(
  user: DoiUser,
  groupId: string,
  groupMemberships: Array<{ groupId: string; role: 'member' | 'admin' }>
): boolean {
  // Cross-bureau admins are admins of all groups
  if (user.isCrossBureauAdmin) {
    return true;
  }

  // Check if user has admin role in the group
  const membership = groupMemberships.find((m) => m.groupId === groupId);
  return membership?.role === 'admin';
}

/**
 * Filter features by user's authorization
 *
 * Removes features the user cannot access
 *
 * @param user - DOI user
 * @param features - List of features
 * @param permission - Requested permission
 * @returns Filtered list of features
 */
export function filterAuthorizedFeatures(
  user: DoiUser,
  features: GeoFeature[],
  permission: Permission
): GeoFeature[] {
  return features.filter((feature) => canAccessFeature(user, feature, permission));
}

/**
 * Build SQL WHERE clause for bureau authorization
 *
 * Returns SQL fragment for filtering by bureau
 *
 * @param user - DOI user
 * @returns SQL WHERE condition
 */
export function getBureauWhereClause(user: DoiUser): string {
  if (user.isCrossBureauAdmin) {
    // No filter - can see all bureaus
    return '1=1';
  }

  // Filter to user's bureau
  return `bureau_id = '${user.bureauId}'`;
}

/**
 * Build SQL WHERE clause for ownership authorization
 *
 * Returns SQL fragment for filtering by ownership
 *
 * @param user - DOI user
 * @param permission - Requested permission
 * @returns SQL WHERE condition
 */
export function getOwnershipWhereClause(user: DoiUser, permission: Permission): string {
  if (user.isCrossBureauAdmin) {
    // No filter - can access everything
    return '1=1';
  }

  if (permission === 'read') {
    // Can read anything in their bureau
    return '1=1';
  }

  // For write/delete: must be owner or in owner group
  const userGroupIds = user.groups.map((g) => `'${g}'`).join(',');

  if (userGroupIds) {
    return `(
      (owner_type = 'user' AND owner_id = '${user.userId}')
      OR (owner_type = 'group' AND owner_id IN (${userGroupIds}))
    )`;
  } else {
    return `(owner_type = 'user' AND owner_id = '${user.userId}')`;
  }
}
