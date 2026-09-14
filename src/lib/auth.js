import { all, first, run, uid, nowIso } from "./db.js";
import { unauthorized } from "./http.js";

const SESSION_DAYS = 30;
const COOKIE_NAME = "cdc_session";

export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookie(token, maxAgeDays = SESSION_DAYS) {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export const clearSessionCookie = () => `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function createSession(env, userId, businessId) {
  const token = uid();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await run(env, `INSERT INTO sessions (id, user_id, business_id, expires_at) VALUES (?,?,?,?)`,
    token, userId, businessId, expires);
  return token;
}

// Middleware: exige sesión válida para el negocio actual (ctx.business ya resuelto por tenant()).
export async function requireStaff(request, env, ctx) {
  const token = getCookie(request, "cdc_session");
  if (!token) return unauthorized();
  const session = await first(env,
    `SELECT s.*, u.email, u.name, u.role FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.business_id = ? AND s.expires_at > ?`,
    token, ctx.business.id, nowIso());
  if (!session) return unauthorized();
  ctx.user = session;
  return null; // null = sigue adelante
}
