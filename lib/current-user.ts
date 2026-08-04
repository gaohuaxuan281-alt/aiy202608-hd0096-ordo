import { headers } from "next/headers";
import { cache } from "react";
import { findUserByCookieHeader } from "./auth";

export const getCurrentUser = cache(async function getCurrentUser() {
  const requestHeaders = await headers();
  return findUserByCookieHeader(requestHeaders.get("cookie"));
});
