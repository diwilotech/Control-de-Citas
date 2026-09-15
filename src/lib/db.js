// Helpers genéricos de D1. Toda consulta de la app pasa por aquí para no repetir SQL a mano.
export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export async function all(env, sql, ...params) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}
export async function first(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first();
}
export async function run(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).run();
}

// CRUD genérico, con scope por negocio (business_id), usado por servicios/especialistas/espacios/clientes
// para no reescribir el mismo SELECT/INSERT/UPDATE/DELETE en cada recurso.
export function makeResource(table, fields) {
  return {
    table,
    fields,
    async list(env, businessId, orderBy = "rowid") {
      return all(env, `SELECT * FROM ${table} WHERE business_id = ? ORDER BY ${orderBy}`, businessId);
    },
    async get(env, businessId, id) {
      return first(env, `SELECT * FROM ${table} WHERE business_id = ? AND id = ?`, businessId, id);
    },
    async create(env, businessId, data) {
      const id = uid();
      // Solo se insertan las columnas que mandó el cliente; las que no, quedan fuera del INSERT
      // para que aplique el DEFAULT de la tabla en vez de guardar NULL explícito.
      const present = fields.filter((f) => data[f] !== undefined);
      const cols = ["id", "business_id", ...present];
      const vals = [id, businessId, ...present.map((f) => normalize(data[f]))];
      const placeholders = cols.map(() => "?").join(",");
      await run(env, `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`, ...vals);
      return this.get(env, businessId, id);
    },
    async update(env, businessId, id, data) {
      const present = fields.filter((f) => f in data);
      if (!present.length) return this.get(env, businessId, id);
      const setSql = present.map((f) => `${f} = ?`).join(", ");
      const vals = present.map((f) => normalize(data[f]));
      await run(env, `UPDATE ${table} SET ${setSql} WHERE business_id = ? AND id = ?`, ...vals, businessId, id);
      return this.get(env, businessId, id);
    },
    async remove(env, businessId, id) {
      await run(env, `DELETE FROM ${table} WHERE business_id = ? AND id = ?`, businessId, id);
    },
  };
}

function normalize(v) {
  if (Array.isArray(v) || (v && typeof v === "object")) return JSON.stringify(v);
  if (v === undefined) return null;
  return v;
}

// Parsea las columnas guardadas como JSON de texto (allowed_space_types, open_days, work_days, etc.)
export function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
