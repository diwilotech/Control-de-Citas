import { json } from "./http.js";

// Registra list/create/update/delete para un recurso simple (servicios, especialistas, espacios,
// clientes, bloqueos) contra un `makeResource(...)` de db.js. Una sola función para los 4 recursos
// en vez de repetir las mismas 4 rutas por cada uno.
export function registerCrud(router, path, resource, orderBy = "rowid") {
  router.get(`/api/:slug/staff/${path}`, async (request, env, ctx) =>
    json(await resource.list(env, ctx.business.id, orderBy)));

  router.post(`/api/:slug/staff/${path}`, async (request, env, ctx) => {
    const body = await request.json().catch(() => ({}));
    return json(await resource.create(env, ctx.business.id, body), { status: 201 });
  });

  router.patch(`/api/:slug/staff/${path}/:id`, async (request, env, ctx) => {
    const body = await request.json().catch(() => ({}));
    return json(await resource.update(env, ctx.business.id, ctx.params.id, body));
  });

  router.delete(`/api/:slug/staff/${path}/:id`, async (request, env, ctx) => {
    await resource.remove(env, ctx.business.id, ctx.params.id);
    return json({ ok: true });
  });
}
