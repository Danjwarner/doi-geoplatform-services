/**
 * DOI User from Identity Server
 *
 * Parsed from JWT token claims
 */
export interface DoiUser {
  /** User ID from DOI Identity Server */
  userId: string;

  /** User's primary DOI bureau */
  bureauId: string;

  /** User's email */
  email?: string;

  /** User's full name */
  name?: string;

  /** Groups the user belongs to */
  groups: string[];

  /** User roles */
  roles: string[];

  /** Whether user has cross-bureau admin access */
  isCrossBureauAdmin: boolean;

  /** JWT token expiration */
  exp?: number;

  /** JWT issued at */
  iat?: number;
}

/**
 * Bureau information
 */
export interface Bureau {
  id: string;
  name: string;
  abbreviation: string;
  description?: string | null;
  createdAt: Date;
}

/**
 * User group
 */
export interface UserGroup {
  id: string;
  name: string;
  bureauId: string;
  description?: string | null;
  createdAt: Date;
}

/**
 * Group membership
 */
export interface GroupMembership {
  groupId: string;
  userId: string;
  role: 'member' | 'admin';
  addedAt: Date;
  addedBy: string;
}
