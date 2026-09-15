import { json, error, readJson } from "../lib/http.js";

// Evolution API llama a esta URL cuando pasa algo en la instancia de WhatsApp del negocio
// (mensaje entrante, cambio de conexión, etc.). El token en la propia URL hace de secreto
// compartido: Evolution la llama sin sesión de staff, así que no hay otra forma de autenticarla.
// El link completo (con el token) se muestra en Ajustes → WhatsApp para pegarlo en Evolution API.
export function registerWebhook(router) {
  router.post("/api/:slug/webhook/evolution/:token", async (request, env, ctx) => {
    if (!ctx.business.webhook_token || ctx.params.token !== ctx.business.webhook_token) {
      return error("Token inválido.", 404);
    }
    await readJson(request);
    return json({ ok: true });
  });
}
