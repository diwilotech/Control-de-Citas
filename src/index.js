import { Router } from "./lib/router.js";
import { json, notFound } from "./lib/http.js";
import { resolveBusiness } from "./lib/tenant.js";
import { requireStaff } from "./lib/auth.js";

import { registerSetup } from "./routes/setup.js";
import { registerPlatform } from "./routes/platform.js";
import { registerAuth } from "./routes/auth.js";
import { registerPublic } from "./routes/public.js";
import { registerAppointments } from "./routes/appointments.js";
import { registerResources } from "./routes/resources.js";
import { registerSettings } from "./routes/settings.js";
import { registerWebhook } from "./routes/webhook.js";

const router = new Router();
registerSetup(router);
registerPlatform(router);
registerAuth(router);
registerPublic(router);
registerAppointments(router);
registerResources(router);
registerSettings(router);
registerWebhook(router);

// Sirve un archivo estático concreto a través del binding de assets (para las rutas bonitas
// /t/:slug y /t/:slug/admin, que no existen como archivo real).
function serveAsset(env, request, file) {
  const url = new URL(request.url);
  url.pathname = file;
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      // /t/:slug/admin -> panel de staff, /t/:slug -> reserva pública del cliente
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "t" && parts[1]) {
        // Sin extensión: Assets sirve el .html directo (200), en vez de redirigir
        // como hace con las rutas .html explícitas — eso le hacía perder el slug al cliente.
        // "/index" también redirige (a "/", por ser el documento índice), así que para la
        // reserva del cliente se pide la raíz directamente.
        if (parts[2] === "admin") return serveAsset(env, request, "/admin");
        return serveAsset(env, request, "/");
      }
      return env.ASSETS.fetch(request);
    }

    const match = router.match(request.method, url.pathname);
    if (!match) return notFound();

    const ctx = { params: match.params };

    // Todas las rutas menos /api/setup son de un negocio (tenant) identificado por :slug.
    if (match.params.slug) {
      const business = await resolveBusiness(env, match.params.slug);
      if (!business) return json({ error: "Negocio no encontrado." }, { status: 404 });
      ctx.business = business;

      // Todo lo que vive bajo /api/:slug/staff/ exige sesión de personal.
      if (url.pathname.startsWith(`/api/${match.params.slug}/staff/`)) {
        const denied = await requireStaff(request, env, ctx);
        if (denied) return denied;
      }
    }

    try {
      return await match.handler(request, env, ctx);
    } catch (err) {
      return json({ error: "Error interno", detail: String(err) }, { status: 500 });
    }
  },
};
