import { run, uid } from "../lib/db.js";
import { json, error, readJson } from "../lib/http.js";
import { handleIncomingWhatsapp } from "../lib/confirm.js";

// Evolution API llama a esta URL cuando pasa algo en la instancia de WhatsApp del negocio
// (mensaje entrante, cambio de conexión, etc.). El token en la propia URL hace de secreto
// compartido: Evolution la llama sin sesión de staff, así que no hay otra forma de autenticarla.
// El link completo (con el token) se muestra en Ajustes → WhatsApp para pegarlo en Evolution API.
export function registerWebhook(router) {
  router.post("/api/:slug/webhook/evolution/:token", async (request, env, ctx) => {
    if (!ctx.business.webhook_token || ctx.params.token !== ctx.business.webhook_token) {
      return error("Token inválido.", 404);
    }
    const raw = await request.text().catch(() => "");
    // Log temporal (tabla webhook_log) para ver el formato real que manda esta instancia de
    // Evolution — varía entre versiones. Se puede borrar la tabla una vez confirmado el parseo.
    try { await run(env, `INSERT INTO webhook_log (id, business_id, body) VALUES (?,?,?)`, uid(), ctx.business.id, raw.slice(0, 4000)); } catch {}
    let body = null;
    try { body = JSON.parse(raw); } catch {}
    // Si el payload no trae un mensaje entrante que confirme una cita, handleIncomingWhatsapp no
    // hace nada — nunca debe tirar error (Evolution reintenta el webhook si no le llega un 200).
    try { await handleIncomingWhatsapp(env, ctx.business, body, new URL(request.url).origin); } catch {}
    return json({ ok: true });
  });
}
