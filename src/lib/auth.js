import { first, run, uid, nowIso } from "./db.js";
import { unauthorized } from "./http.js";

const SESSION_DAYS = 30;

export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Fábrica de sesiones por cookie: la usan tanto las sesiones de personal de un negocio como las
// del super admin de la plataforma, para no repetir la lógica de cookie/expiración dos veces.
function sessionKit(cookieName, table, ownerColumn) {
  const cookie = (token, days = SESSION_DAYS) =>
    `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
  const clear = () => `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  async function create(env, ownerId, extra = {}) {
    const token = uid();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    const extraCols = Object.keys(extra);
    const cols = ["id", ownerColumn, "expires_at", ...extraCols];
    const vals = [token, ownerId, expiresAt, ...extraCols.map((k) => extra[k])];
    await run(env, `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...vals);
    return token;
  }
  return { cookieName, cookie, clear, create };
}

const staffKit = sessionKit("cdc_session", "sessions", "user_id");
const adminKit = sessionKit("cdc_admin", "admin_sessions", "admin_id");

export const SESSION_COOKIE_NAME = staffKit.cookieName;
export const sessionCookie = staffKit.cookie;
export const clearSessionCookie = staffKit.clear;
export const createSession = (env, userId, businessId) => staffKit.create(env, userId, { business_id: businessId });

export const ADMIN_COOKIE_NAME = adminKit.cookieName;
export const adminCookie = adminKit.cookie;
export const clearAdminCookie = adminKit.clear;
export const createAdminSession = (env, adminId) => adminKit.create(env, adminId);

// Middleware: exige sesión válida de personal para el negocio actual (ctx.business ya resuelto).
export async function requireStaff(request, env, ctx) {
  const token = getCookie(request, SESSION_COOKIE_NAME);
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

// Middleware: exige sesión válida del super admin de la plataforma (para crear/listar negocios).
export async function requirePlatformAdmin(request, env, ctx) {
  const token = getCookie(request, ADMIN_COOKIE_NAME);
  if (!token) return unauthorized();
  const session = await first(env,
    `SELECT s.*, a.email, a.name FROM admin_sessions s
     JOIN platform_admins a ON a.id = s.admin_id
     WHERE s.id = ? AND s.expires_at > ?`,
    token, nowIso());
  if (!session) return unauthorized();
  ctx.admin = session;
  return null;
}
