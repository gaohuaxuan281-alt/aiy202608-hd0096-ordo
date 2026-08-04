import { headers } from "next/headers";
import { findUserByCookieHeader } from "./auth";

export async function getCurrentUser() {
  const requestHeaders = await headers();
  return findUserByCookieHeader(requestHeaders.get("cookie"));
}
