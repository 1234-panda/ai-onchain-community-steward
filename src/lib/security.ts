import { randomBytes } from "crypto";

export function createNonce() {
  return randomBytes(16).toString("hex");
}

export function createId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function requireAdmin(request: Request) {
  const role = request.headers.get("x-demo-role");
  const adminId = request.headers.get("x-admin-id");
  const password = request.headers.get("x-admin-password");

  if (process.env.ADMIN_DASHBOARD_PASSWORD && password !== process.env.ADMIN_DASHBOARD_PASSWORD) {
    throw new Error("Admin password required");
  }

  if (role !== "admin" || !adminId) {
    throw new Error("Admin permission required");
  }

  return adminId;
}

export function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() < Date.now();
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
}
