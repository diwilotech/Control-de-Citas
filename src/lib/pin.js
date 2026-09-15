// PIN con salt aleatorio, hasheado con Web Crypto (disponible en Workers) — evita traer una
// librería de hashing solo para no guardar el PIN en texto plano. Lo usan tanto el super admin
// de la plataforma como los usuarios de cada negocio, para no repetir esta lógica dos veces.
export const randomSalt = () => crypto.randomUUID();

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashPin = (pin, salt) => sha256Hex(`${salt}:${pin}`);

export async function verifyPin(pin, salt, hash) {
  if (!salt || !hash) return false;
  return (await hashPin(pin, salt)) === hash;
}

export const validatePinFormat = (pin) => /^\d{4,8}$/.test(String(pin ?? ""));
