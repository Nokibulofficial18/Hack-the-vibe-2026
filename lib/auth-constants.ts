import type { PayoutMethodType } from "./domain";

export type UserRole = "FARMER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  balance: number;
  payoutMethod: PayoutMethodType;
  mobileNumber: string;
  label: string;
}

export const AUTH_STORAGE_KEY = "weathershield_mock_user_id";
export const AUTH_COOKIE_NAME = "weathershield_user_id";
export const AUTH_HEADER_NAME = "x-weathershield-user-id";

export const MOCK_USERS: readonly AuthUser[] = [
  {
    id: "user-farmer-1",
    email: "rokon.uddin@krishi.bd",
    name: "Rokon Uddin",
    role: "FARMER",
    balance: 12500.0,
    payoutMethod: "BKASH",
    mobileNumber: "+8801712345678",
    label: "Farmer · Sunamganj, Kurigram & Bogura",
  },
  {
    id: "user-farmer-2",
    email: "fatima.begum@krishi.bd",
    name: "Fatima Begum",
    role: "FARMER",
    balance: 18000.0,
    payoutMethod: "NAGAD",
    mobileNumber: "+8801819876543",
    label: "Farmer · Satkhira & Rajshahi",
  },
  {
    id: "user-admin-1",
    email: "abdul.karim@weathershield.bd",
    name: "Abdul Karim",
    role: "ADMIN",
    balance: 2500000.0,
    payoutMethod: "ROCKET",
    mobileNumber: "+8801911223344",
    label: "Insurer Risk Admin (Bangladesh)",
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
