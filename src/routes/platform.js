import { all, first, run, uid } from "../lib/db.js";
import { json, error, readJson } from "../lib/http.js";
import {
  createAdminSession, getCookie, adminCookie, clearAdminCookie,
  requirePlatformAdmin, ADMIN_COOKIE_NAME,
} from "../lib/auth.js";
import { hashPin, verifyPin, randomSalt, validatePinFormat } from "../lib/pin.js";

// Cuenta única de super admin de la plataforma: la primera persona en entrar se registra desde
// /setup.html; una vez que existe, /api/admin/register queda cerrado y solo sirve el login. Solo
// el super admin puede crear negocios nuevos (ver /api/setup en routes/setup.js).
export function registerPlatform(router) {
  router.get("/api/admin/status", async (request, env) => {
    const admin = await first(env, `SELECT id FROM platform_admins LIMIT 1`);
    return json({ hasAdmin: !!admin });
  });

  router.post("/api/admin/register", async (request, env) => {
    const existing = await first(env, `SELECT id FROM platform_admins LIMIT 1`);
    if (existing) return error("Ya existe un super admin registrado. Inicia sesión.", 409);

    const { email, name, pin } = await readJson(request);
    if (!email || !name) return error("Faltan correo y nombre.");
    if (!validatePinFormat(pin)) return error("El PIN debe tener entre 4 y 8 dígitos.");

    const id = uid();
    const salt = randomSalt();
    await run(env, `INSERT INTO platform_admins (id, email, name, pin_hash, pin_salt) VALUES (?,?,?,?,?)`,
      id, String(email).trim().toLowerCase(), name, await hashPin(pin, salt), salt);

    const token = await createAdminSession(env, id);
    return json({ email, name }, { status: 201, headers: { "set-cookie": adminCookie(token) } });
  });

  router.post("/api/admin/login", async (request, env) => {
    const { email, pin } = await readJson(request);
    const admin = await first(env, `SELECT * FROM platform_admins WHERE email=?`,
      String(email || "").trim().toLowerCase());
    if (!admin || !(await verifyPin(pin, admin.pin_salt, admin.pin_hash))) {
      return error("Correo o PIN incorrecto.", 401);
    }

    const token = await createAdminSession(env, admin.id);
    return json({ email: admin.email, name: admin.name }, { headers: { "set-cookie": adminCookie(token) } });
  });

  router.post("/api/admin/logout", async (request, env) => {
    const token = getCookie(request, ADMIN_COOKIE_NAME);
    if (token) await run(env, `DELETE FROM admin_sessions WHERE id=?`, token);
    return json({ ok: true }, { headers: { "set-cookie": clearAdminCookie() } });
  });

  router.get("/api/admin/me", async (request, env, ctx) => {
    const denied = await requirePlatformAdmin(request, env, ctx);
    if (denied) return denied;
    return json({ email: ctx.admin.email, name: ctx.admin.name });
  });

  router.get("/api/admin/businesses", async (request, env, ctx) => {
    const denied = await requirePlatformAdmin(request, env, ctx);
    if (denied) return denied;
    return json(await all(env, `SELECT id, slug, name, whatsapp_enabled, created_at FROM businesses ORDER BY created_at DESC`));
  });

  // Detalle de un negocio para el super admin: usuarios, servicios y especialistas.
  router.get("/api/admin/businesses/:id", async (request, env, ctx) => {
    const denied = await requirePlatformAdmin(request, env, ctx);
    if (denied) return denied;
    const business = await first(env, `SELECT * FROM businesses WHERE id=?`, ctx.params.id);
    if (!business) return error("Negocio no encontrado.", 404);
    const [users, services, specialists] = await Promise.all([
      all(env, `SELECT id, email, name, role, phone, created_at FROM users WHERE business_id=? ORDER BY created_at`, business.id),
      all(env, `SELECT id, name, duration_min, price FROM services WHERE business_id=?`, business.id),
      all(env, `SELECT id, name FROM specialists WHERE business_id=?`, business.id),
    ]);
    return json({ business, users, services, specialists });
  });

  // Agrega un usuario (dueño o personal) a un negocio existente.
  router.post("/api/admin/businesses/:id/users", async (request, env, ctx) => {
    const denied = await requirePlatformAdmin(request, env, ctx);
    if (denied) return denied;
    const business = await first(env, `SELECT id FROM businesses WHERE id=?`, ctx.params.id);
    if (!business) return error("Negocio no encontrado.", 404);

    const { email, name, pin, role, phone } = await readJson(request);
    if (!email || !name) return error("Faltan correo y nombre.");
    if (!validatePinFormat(pin)) return error("El PIN debe tener entre 4 y 8 dígitos.");

    const id = uid();
    const salt = randomSalt();
    await run(env,
      `INSERT INTO users (id, business_id, email, phone, name, role, pin_hash, pin_salt) VALUES (?,?,?,?,?,?,?,?)`,
      id, business.id, String(email).trim().toLowerCase(), phone || null, name, role === "owner" ? "owner" : "staff",
      await hashPin(pin, salt), salt);
    return json({ id }, { status: 201 });
  });

  // Cambia el tipo de usuario (dueño/personal) dentro de un negocio.
  router.patch("/api/admin/businesses/:id/users/:userId", async (request, env, ctx) => {
    const denied = await requirePlatformAdmin(request, env, ctx);
    if (denied) return denied;
    const { role } = await readJson(request);
    if (role !== "owner" && role !== "staff") return error("role debe ser 'owner' o 'staff'.");
    await run(env, `UPDATE users SET role=? WHERE id=? AND business_id=?`, role, ctx.params.userId, ctx.params.id);
    return json({ ok: true });
  });
}
