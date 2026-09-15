import { first, run } from "../lib/db.js";
import { json, error, readJson } from "../lib/http.js";
import { createSession, getCookie, sessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from "../lib/auth.js";
import { verifyPin } from "../lib/pin.js";

// Login directo: correo + PIN definidos al crear el usuario, sin pasos intermedios.
export function registerAuth(router) {
  router.post("/api/:slug/auth/login", async (request, env, ctx) => {
    const { email, pin } = await readJson(request);
    const user = await first(env, `SELECT * FROM users WHERE business_id=? AND email=?`,
      ctx.business.id, String(email || "").toLowerCase());
    if (!user || !(await verifyPin(pin, user.pin_salt, user.pin_hash))) {
      return error("Correo o PIN incorrecto.", 401);
    }

    const token = await createSession(env, user.id, ctx.business.id);
    return json({ user: { email: user.email, name: user.name, role: user.role } },
      { headers: { "set-cookie": sessionCookie(token) } });
  });

  router.post("/api/:slug/auth/logout", async (request, env, ctx) => {
    const token = getCookie(request, SESSION_COOKIE_NAME);
    if (token) await run(env, `DELETE FROM sessions WHERE id=?`, token);
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  router.get("/api/:slug/staff/me", async (request, env, ctx) =>
    json({ email: ctx.user.email, name: ctx.user.name, role: ctx.user.role }));
}
