// Cliente de Evolution API (WhatsApp). Evolution corre en un servidor aparte (Cloudflare Workers
// no puede alojarla); acá solo se le hacen peticiones HTTP.
// Contrato asumido (Evolution API v2): POST {url}/message/sendText/{instance}
//   headers: { apikey }
//   body: { number, text }
// Si tu instancia usa un contrato distinto, ajusta solo esta función — el resto de la app no
// necesita cambiar (por eso vive en un único lugar).
// Completa un número local (ej. celular colombiano de 10 dígitos: 300 123 4567) con el código de
// país del negocio, para que quede en formato internacional (573001234567) — lo que espera
// Evolution API/WhatsApp. Si el número ya trae 11+ dígitos, se asume que ya incluye el código.
export function normalizePhone(phone, countryCode) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length > 10 || !countryCode) return digits;
  return `${countryCode}${digits}`;
}

export async function sendWhatsApp(env, business, phone, text) {
  if (!business.whatsapp_enabled) {
    return { ok: false, skipped: true, error: "WhatsApp está desactivado para este negocio." };
  }
  const baseUrl = business.evolution_url || env.EVOLUTION_API_URL;
  const instance = business.evolution_instance || env.EVOLUTION_DEFAULT_INSTANCE;
  const apiKey = business.evolution_api_key || env.EVOLUTION_API_KEY;
  if (!baseUrl || !instance || !apiKey) {
    const missing = [!baseUrl && "URL", !instance && "instancia", !apiKey && "API key"].filter(Boolean).join(", ");
    return { ok: false, error: `Evolution API no está configurada (falta: ${missing}).` };
  }
  const cleanPhone = normalizePhone(phone, business.whatsapp_country_code);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
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
