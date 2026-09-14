// Helpers de respuesta HTTP, reutilizados por todas las rutas (evita repetir JSON.stringify/headers).
export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}
export function error(message, status = 400) {
  return json({ error: message }, { status });
}
export const notFound = () => error("No encontrado", 404);
export const unauthorized = () => error("No autorizado", 401);

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}
