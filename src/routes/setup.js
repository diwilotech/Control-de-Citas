import { run, uid } from "../lib/db.js";
import { json, error, readJson } from "../lib/http.js";
import { resolveBusiness } from "../lib/tenant.js";
import { DEFAULT_TEMPLATES } from "../lib/templates.js";

// Crea un negocio nuevo (tenant) con su primer usuario dueño. Sin esto no hay forma de arrancar.
export function registerSetup(router) {
  router.post("/api/setup", async (request, env) => {
    const body = await readJson(request);
    const slug = String(body.slug || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
      return error("El slug debe tener 3-40 caracteres: minúsculas, números o guiones.");
    }
    if (!body.businessName || !body.ownerEmail || !body.ownerName) {
      return error("Faltan businessName, ownerName u ownerEmail.");
    }
    if (await resolveBusiness(env, slug)) return error("Ese slug ya está en uso.", 409);

    const businessId = uid();
    await run(env, `INSERT INTO businesses (id, slug, name) VALUES (?,?,?)`, businessId, slug, body.businessName);

    const userId = uid();
    await run(env, `INSERT INTO users (id, business_id, email, phone, name, role) VALUES (?,?,?,?,?,'owner')`,
      userId, businessId, String(body.ownerEmail).toLowerCase(), body.ownerPhone || null, body.ownerName);

    for (const [key, tplBody] of Object.entries(DEFAULT_TEMPLATES)) {
      await run(env, `INSERT INTO message_templates (id, business_id, key, body) VALUES (?,?,?,?)`,
        uid(), businessId, key, tplBody);
    }

    await run(env,
      `INSERT INTO spaces (id, business_id, label, type, shape, capacity, x, y, w, h) VALUES (?,?,'General','general','square',4,0,0,3,3)`,
      uid(), businessId);

    return json({ slug, ownerEmail: body.ownerEmail }, { status: 201 });
  });
}
