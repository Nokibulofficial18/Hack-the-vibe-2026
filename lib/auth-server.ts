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
import type { PayoutMethodType } from "./domain";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  balance: number;
  payoutMethod: PayoutMethodType;
  mobileNumber: string;
}

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
      payoutMethod: true,
      mobileNumber: true,
    },
  });

  if (dbUser) {
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as UserRole,
      balance: dbUser.balance,
      payoutMethod: dbUser.payoutMethod as PayoutMethodType,
      mobileNumber: dbUser.mobileNumber,
    };
  }

  const fallback: AuthUser = getMockUserById(targetId);
  return {
    id: fallback.id,
    email: fallback.email,
    name: fallback.name,
    role: fallback.role,
    balance: fallback.balance,
    payoutMethod: fallback.payoutMethod,
    mobileNumber: fallback.mobileNumber,
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
