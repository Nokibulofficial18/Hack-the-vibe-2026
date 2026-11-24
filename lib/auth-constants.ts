export type UserRole = "FARMER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  balance: number;
  label: string;
}

export const AUTH_STORAGE_KEY = "weathershield_mock_user_id";
export const AUTH_COOKIE_NAME = "weathershield_user_id";
export const AUTH_HEADER_NAME = "x-weathershield-user-id";

export const MOCK_USERS: readonly AuthUser[] = [
  {
    id: "user-farmer-1",
    email: "farmer@example.com",
    name: "Mateo Santos",
    role: "FARMER",
    balance: 450.0,
    label: "Farmer · Luzon & Bukidnon",
  },
  {
    id: "user-farmer-2",
    email: "priya.nair@weathershield.io",
    name: "Priya Nair",
    role: "FARMER",
    balance: 620.0,
    label: "Farmer · Wayanad",
  },
  {
    id: "user-admin-1",
    email: "admin@weathershield.io",
    name: "Elena Rostova",
    role: "ADMIN",
    balance: 250000.0,
    label: "Insurer Risk Admin",
  },
] as const;

export const DEFAULT_AUTH_USER: AuthUser = MOCK_USERS[0];

export function getMockUserById(userId?: string | null): AuthUser {
  if (!userId) return DEFAULT_AUTH_USER;
  return MOCK_USERS.find((u) => u.id === userId) ?? DEFAULT_AUTH_USER;
}

export function getMockUserByRole(role: UserRole): AuthUser {
  return MOCK_USERS.find((u) => u.role === role) ?? DEFAULT_AUTH_USER;
}

export function canAccessResource(
  user: Pick<AuthUser, "id" | "role">,
  ownerUserId: string
): boolean {
  return user.role === "ADMIN" || user.id === ownerUserId;
}
