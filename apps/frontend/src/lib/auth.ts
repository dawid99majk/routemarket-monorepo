export const ROLES = {
  USER: 'user',
  CREATOR: 'creator',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

interface RoleCheckable {
  roles?: string[];
}

export function isAdmin(user: RoleCheckable | null | undefined): boolean {
  return user?.roles?.includes(ROLES.ADMIN) ?? false;
}

export function isCreator(user: RoleCheckable | null | undefined): boolean {
  return user?.roles?.includes(ROLES.CREATOR) ?? false;
}

export function hasRole(user: RoleCheckable | null | undefined, roles: string[]): boolean {
  if (!user?.roles) return false;
  return user.roles.some((r) => roles.includes(r));
}

export function normalizeRole(raw: unknown): UserRole {
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (lower === ROLES.ADMIN) return ROLES.ADMIN;
    if (lower === ROLES.CREATOR) return ROLES.CREATOR;
  }
  return ROLES.USER;
}
