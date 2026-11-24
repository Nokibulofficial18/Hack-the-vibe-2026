"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_COOKIE_NAME,
  AUTH_HEADER_NAME,
  AUTH_STORAGE_KEY,
  DEFAULT_AUTH_USER,
  MOCK_USERS,
  canAccessResource,
  getMockUserById,
  getMockUserByRole,
  type AuthUser,
  type UserRole,
} from "./auth-constants";

export {
  AUTH_COOKIE_NAME,
  AUTH_HEADER_NAME,
  AUTH_STORAGE_KEY,
  DEFAULT_AUTH_USER,
  MOCK_USERS,
  canAccessResource,
  getMockUserById,
  getMockUserByRole,
  type AuthUser,
  type UserRole,
};

export interface AuthContextValue {
  user: AuthUser;
  users: readonly AuthUser[];
  isAdmin: boolean;
  isFarmer: boolean;
  isHydrated: boolean;
  switchRole: (role: UserRole) => void;
  switchUser: (userId: string) => void;
  toggleRole: () => void;
  getAuthHeaders: () => Record<string, string>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function persistAuthSelection(userId: string) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, userId);
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
  if (typeof document !== "undefined") {
    document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(userId)}; path=/; max-age=2592000; SameSite=Lax`;
  }
}

export interface AuthProviderProps {
  children: ReactNode;
  initialUserId?: string;
}

export function AuthProvider({ children, initialUserId }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser>(() => getMockUserById(initialUserId));
  const [isHydrated, setIsHydrated] = useState(false);
  const lastFarmerIdRef = useRef<string>(
    user.role === "FARMER" ? user.id : getMockUserByRole("FARMER").id
  );

  // Sync persisted selection on mount and ensure SSR cookie stays aligned
  useEffect(() => {
    let resolved = getMockUserById(initialUserId);

    if (!initialUserId && typeof window !== "undefined") {
      try {
        const storedId = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (storedId) {
          resolved = getMockUserById(storedId);
        }
      } catch {
        // Ignore storage read errors
      }
    }

    if (resolved.role === "FARMER") {
      lastFarmerIdRef.current = resolved.id;
    }

    setUser(resolved);
    persistAuthSelection(resolved.id);
    setIsHydrated(true);
  }, [initialUserId]);

  const switchUser = useCallback((userId: string) => {
    const nextUser = getMockUserById(userId);
    if (nextUser.role === "FARMER") {
      lastFarmerIdRef.current = nextUser.id;
    }
    setUser(nextUser);
    persistAuthSelection(nextUser.id);
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    const nextUser =
      role === "FARMER"
        ? getMockUserById(lastFarmerIdRef.current)
        : getMockUserByRole("ADMIN");
    setUser(nextUser);
    persistAuthSelection(nextUser.id);
  }, []);

  const toggleRole = useCallback(() => {
    setUser((prev) => {
      const nextUser =
        prev.role === "ADMIN"
          ? getMockUserById(lastFarmerIdRef.current)
          : getMockUserByRole("ADMIN");
      persistAuthSelection(nextUser.id);
      return nextUser;
    });
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    return {
      [AUTH_HEADER_NAME]: user.id,
    };
  }, [user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      users: MOCK_USERS,
      isAdmin: user.role === "ADMIN",
      isFarmer: user.role === "FARMER",
      isHydrated,
      switchRole,
      switchUser,
      toggleRole,
      getAuthHeaders,
    }),
    [user, isHydrated, switchRole, switchUser, toggleRole, getAuthHeaders]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
