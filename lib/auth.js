// lib/auth.js

import { getToken } from "next-auth/jwt";
import { getDataBackend } from "./runtimeConfig";

/**
 * Resolve the current authenticated user from the request.
 * Returns null if unauthenticated.
 * Normalized shape across backends:
 *   { phone, profileID, userId, backend, superAdmin, isUsernameMissing }
 * - userId is only set in Postgres mode (numeric UUID/PK as stored)
 */
export async function getCurrentUser(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.phone) return null;

  const backend = getDataBackend();
  const user = {
    phone: token.phone || null,
    profileID: token.profileID || null,
    backend,
    superAdmin: Boolean(token.superAdmin),
    isUsernameMissing: Boolean(token.isUsernameMissing),
  };

  if (backend === "postgres") {
    user.userId = token.userId || null;
  } else {
    user.userId = null;
  }

  return user;
}
