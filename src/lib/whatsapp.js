// Cliente de Evolution API (WhatsApp). Evolution corre en un servidor aparte (Cloudflare Workers
// no puede alojarla); acá solo se le hacen peticiones HTTP.
// Contrato asumido (Evolution API v2): POST {url}/message/sendText/{instance}
//   headers: { apikey }
//   body: { number, text }
// Si tu instancia usa un contrato distinto, ajusta solo esta función — el resto de la app no
// necesita cambiar (por eso vive en un único lugar).
export async function sendWhatsApp(env, business, phone, text) {
  const baseUrl = env.EVOLUTION_API_URL;
  const instance = business.evolution_instance || env.EVOLUTION_DEFAULT_INSTANCE;
  const apiKey = business.evolution_api_key || env.EVOLUTION_API_KEY;
  if (!baseUrl || !instance || !apiKey) {
    return { ok: false, error: "Evolution API no está configurada (faltan EVOLUTION_API_URL / instancia / api key)." };
  }
  const cleanPhone = String(phone).replace(/\D/g, "");
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: cleanPhone, text }),
    });
    const ok = res.ok;
    return { ok, status: res.status, error: ok ? null : await res.text().catch(() => "") };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
