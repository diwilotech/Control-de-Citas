import { first, run, uid, nowIso } from "../lib/db.js";
import { json, error, readJson } from "../lib/http.js";
import { createSession, getCookie, sessionCookie, clearSessionCookie } from "../lib/auth.js";
import { sendWhatsApp } from "../lib/whatsapp.js";
import { DEFAULT_TEMPLATES, fillTemplate } from "../lib/templates.js";

// Login sin contraseña: se pide un código de 6 dígitos que se envía por WhatsApp (Evolution API)
// al celular registrado del usuario. Mientras no haya un proveedor de correo conectado, este es
// el canal real disponible — ver README para agregar correo más adelante.
export function registerAuth(router) {
  router.post("/api/:slug/auth/request-code", async (request, env, ctx) => {
    const { email } = await readJson(request);
    const user = await first(env, `SELECT * FROM users WHERE business_id=? AND email=?`,
      ctx.business.id, String(email || "").toLowerCase());
    if (!user) return error("No existe un usuario con ese correo para este negocio.", 404);
    if (!user.phone) return error("Este usuario no tiene celular registrado para recibir el código.", 400);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await run(env, `INSERT INTO login_codes (id, user_id, code, expires_at) VALUES (?,?,?,?)`,
      uid(), user.id, code, expiresAt);

    const tpl = await first(env, `SELECT body FROM message_templates WHERE business_id=? AND key='otp'`, ctx.business.id);
    const text = fillTemplate(tpl ? tpl.body : DEFAULT_TEMPLATES.otp, { codigo: code, negocio: ctx.business.name });
    const sent = await sendWhatsApp(env, ctx.business, user.phone, text);
    if (!sent.ok) return error(`No se pudo enviar el código: ${sent.error}`, 502);

    return json({ sent: true });
  });

  router.post("/api/:slug/auth/verify-code", async (request, env, ctx) => {
    const { email, code } = await readJson(request);
    const user = await first(env, `SELECT * FROM users WHERE business_id=? AND email=?`,
      ctx.business.id, String(email || "").toLowerCase());
    if (!user) return error("Usuario no encontrado.", 404);

    const login = await first(env,
      `SELECT * FROM login_codes WHERE user_id=? AND code=? AND used=0 AND expires_at > ? ORDER BY rowid DESC LIMIT 1`,
      user.id, String(code || ""), nowIso());
    if (!login) return error("Código inválido o vencido.", 401);

    await run(env, `UPDATE login_codes SET used=1 WHERE id=?`, login.id);
    const token = await createSession(env, user.id, ctx.business.id);
    return json({ user: { email: user.email, name: user.name, role: user.role } },
      { headers: { "set-cookie": sessionCookie(token) } });
  });

  router.post("/api/:slug/auth/logout", async (request, env, ctx) => {
    const token = getCookie(request, "cdc_session");
    if (token) await run(env, `DELETE FROM sessions WHERE id=?`, token);
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  router.get("/api/:slug/staff/me", async (request, env, ctx) =>
    json({ email: ctx.user.email, name: ctx.user.name, role: ctx.user.role }));
}
