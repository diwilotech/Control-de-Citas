import { uid } from "../lib/db.js";
import { json, error, notFound } from "../lib/http.js";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Fotos guardadas en R2 (bucket FILES). El key real siempre es {business_id}/{nombre} — un
// negocio nunca puede leer ni pisar el archivo de otro aunque adivine el nombre, porque
// business_id sale del :slug de la URL, no de lo que mande el cliente.
export function registerFiles(router) {
  router.post("/api/:slug/staff/upload", async (request, env, ctx) => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return error("Falta el archivo.");
    if (!ALLOWED_TYPES.includes(file.type)) return error("Solo se aceptan imágenes (JPG, PNG, WEBP, GIF).");
    if (file.size > MAX_BYTES) return error("La imagen pesa más de 5 MB.");

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const name = `${uid()}.${ext}`;
    await env.FILES.put(`${ctx.business.id}/${name}`, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    return json({ name }, { status: 201 });
  });

  router.get("/api/:slug/public/files/:name", async (request, env, ctx) => {
    const obj = await env.FILES.get(`${ctx.business.id}/${ctx.params.name}`);
    if (!obj) return notFound();
    return new Response(obj.body, {
      headers: {
        "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });
}
