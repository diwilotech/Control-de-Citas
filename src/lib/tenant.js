import { first } from "./db.js";

// Resuelve el negocio (tenant) a partir del slug en la URL: /api/:slug/...
export async function resolveBusiness(env, slug) {
  return first(env, `SELECT * FROM businesses WHERE slug = ?`, slug);
}
