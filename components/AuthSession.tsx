"use client";

import { createContext, useContext } from "react";
import type { AuthUser } from "../lib/auth";

const AuthSessionContext = createContext<AuthUser | null>(null);

export function AuthSessionProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  return <AuthSessionContext.Provider value={user}>{children}</AuthSessionContext.Provider>;
}

export function useAuthUser() {
  const user = useContext(AuthSessionContext);
  if (!user) throw new Error("useAuthUser must be used inside AuthSessionProvider");
  return user;
}
