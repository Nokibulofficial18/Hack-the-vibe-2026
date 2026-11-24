import { cookies } from "next/headers";
import prisma from "./prisma";
import {
  AUTH_COOKIE_NAME,
  AUTH_HEADER_NAME,
  DEFAULT_AUTH_USER,
  canAccessResource,
  getMockUserById,
  type AuthUser,
  type UserRole,
} from "./auth-constants";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  balance: number;
}

/**
 * Resolves the active mock-authenticated user on the server from:
 * 1. `x-weathershield-user-id` request header (API clients / fetch calls)
 * 2. `weathershield_user_id` cookie (synced automatically by AuthProvider)
 * 3. Default Farmer account fallback
 */
export async function getServerSessionUser(request?: Request): Promise<SessionUser> {
  const headerUserId = request?.headers.get(AUTH_HEADER_NAME);
  const cookieStore = cookies();
  const cookieUserId = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const targetId = headerUserId || cookieUserId || DEFAULT_AUTH_USER.id;

  const dbUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      balance: true,
    },
  });

  if (dbUser) {
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as UserRole,
      balance: dbUser.balance,
    };
  }

  const fallback: AuthUser = getMockUserById(targetId);
  return {
    id: fallback.id,
    email: fallback.email,
    name: fallback.name,
    role: fallback.role,
    balance: fallback.balance,
  };
}

export async function requireAdmin(request?: Request): Promise<SessionUser> {
  const user = await getServerSessionUser(request);
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN_ADMIN_ONLY");
  }
  return user;
}

export { canAccessResource };
