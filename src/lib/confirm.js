import { first, run, uid, all } from "./db.js";
import { sendWhatsApp } from "./whatsapp.js";
import { sendEmail } from "./mailer.js";
import { DEFAULT_TEMPLATES, fillTemplate, formatDateHuman, formatAmPm } from "./templates.js";

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

async function templateBody(env, business, key) {
  const tpl = await first(env, `SELECT body FROM message_templates WHERE business_id=? AND key=?`, business.id, key);
  return tpl ? tpl.body : DEFAULT_TEMPLATES[key];
}

async function logMessage(env, apptId, businessId, templateKey, body, result) {
  await run(env,
    `INSERT INTO appointment_messages (id, appointment_id, business_id, template_key, body, status) VALUES (?,?,?,?,?,?)`,
    uid(), apptId, businessId, templateKey, body, result.ok ? "sent" : result.skipped ? "skipped" : "failed");
}

// Token estable por cliente para el link de "mis citas" — se genera una sola vez y se reusa en
// todas las reservas futuras de ese mismo cliente.
export async function ensureManageToken(env, clientId) {
  const client = await first(env, `SELECT manage_token FROM clients WHERE id=?`, clientId);
  if (client?.manage_token) return client.manage_token;
  const token = uid();
  await run(env, `UPDATE clients SET manage_token=? WHERE id=?`, token, clientId);
  return token;
}

function manageLink(origin, business, manageToken) {
  return `${origin}/${business.slug}/mis-citas?t=${manageToken}`;
}

// Recién reservada: para correo, el SERVIDOR manda un link de confirmación por SMTP. Para
// WhatsApp NO se manda nada desde el negocio (eso es justo lo que hacía que Evolution API se
// arriesgara a un baneo) — en vez de eso se arma un link wa.me con el mensaje (y el PIN) ya
// escrito, para que sea el CLIENTE quien lo mande desde su propio WhatsApp. Deja la cita
// pendiente hasta que el cliente responda/haga clic.
export async function sendConfirmationRequest(env, business, appt, service, origin) {
  const windowHours = business.confirm_window_hours || 3;
  const expires = new Date(Date.now() + windowHours * 3600000).toISOString();

  if (appt.confirm_channel === "email") {
    const token = uid();
    await run(env, `UPDATE appointments SET confirm_token=?, confirm_expires_at=? WHERE id=?`, token, expires, appt.id);
    const link = `${origin}/api/${business.slug}/public/confirm-email/${appt.id}/${token}`;
    const body = fillTemplate(await templateBody(env, business, "confirmEmail"), {
      cliente: appt.client_name, servicio: service.name, fecha: formatDateHuman(appt.date), hora: formatAmPm(appt.start),
      negocio: business.name, ventana: windowHours, link,
    });
    const result = await sendEmail(env, business, appt.client_email, `Confirma tu cita — ${business.name}`, body);
    await logMessage(env, appt.id, business.id, "confirmEmail", body, result);
    return result;
  }

  const businessNumber = String(business.whatsapp_business_number || "").replace(/\D/g, "");
  if (!businessNumber) {
    return { ok: false, error: "Falta configurar el número de WhatsApp del negocio en Ajustes." };
  }
  const pin = randomPin();
  await run(env, `UPDATE appointments SET confirm_pin=?, confirm_expires_at=? WHERE id=?`, pin, expires, appt.id);
  const text = fillTemplate(await templateBody(env, business, "confirmWhatsapp"), {
    cliente: appt.client_name, servicio: service.name, fecha: formatDateHuman(appt.date), hora: formatAmPm(appt.start),
    negocio: business.name, ventana: windowHours, codigo: pin,
  });
  const waLink = `https://wa.me/${businessNumber}?text=${encodeURIComponent(text)}`;
  return { ok: true, waLink, windowHours };
}

// Ya confirmada (PIN respondido o link clickeado): avisa y manda el link de autogestión.
export async function sendConfirmedNotice(env, business, appt, service, origin) {
  const manageToken = await ensureManageToken(env, appt.client_id);
  const link = manageLink(origin, business, manageToken);
  const body = fillTemplate(await templateBody(env, business, "confirmed"), {
    cliente: appt.client_name, servicio: service.name, fecha: formatDateHuman(appt.date), hora: formatAmPm(appt.start),
    negocio: business.name, link,
  });
  const result = appt.confirm_channel === "email"
    ? await sendEmail(env, business, appt.client_email, `Cita confirmada — ${business.name}`, body)
    : await sendWhatsApp(env, business, appt.client_phone, body);
  await logMessage(env, appt.id, business.id, "confirmed", body, result);
  return result;
}

// Cancelación/solicitud de reagendar hechas por el cliente desde el link de "mis citas".
export async function sendSelfServiceNotice(env, business, appt, service, templateKey) {
  const body = fillTemplate(await templateBody(env, business, templateKey), {
    cliente: appt.client_name, servicio: service.name, fecha: formatDateHuman(appt.date), hora: formatAmPm(appt.start),
    negocio: business.name,
  });
  const result = appt.confirm_channel === "email"
    ? await sendEmail(env, business, appt.client_email, `${business.name}`, body)
    : await sendWhatsApp(env, business, appt.client_phone, body);
  await logMessage(env, appt.id, business.id, templateKey, body, result);
  return result;
}

// Webhook de Evolution API: busca un PIN de 4 dígitos en un mensaje entrante y, si machea con una
// cita pendiente de ese negocio, la confirma. Nunca debe tirar error — si el payload no calza con
// lo esperado, simplemente no hace nada (Evolution manda otros eventos aparte de mensajes:
// conexión, estado de entrega, etc.).
//
// No se valida el remitente contra el teléfono de la cita: WhatsApp está migrando las cuentas a
// un identificador de remitente "LID" (remoteJid termina en @lid, no en @s.whatsapp.net) que ya
// no trae el número de teléfono real — confirmado con el payload real de esta instancia de
// Evolution. El PIN de 4 dígitos, único por negocio y con vencimiento corto, ya es suficiente.
export async function handleIncomingWhatsapp(env, business, body, origin) {
  if (body?.event && body.event !== "messages.upsert") return;
  const data = body?.data;
  if (!data || data.key?.fromMe) return;
  const text = String(data.message?.conversation || data.message?.extendedTextMessage?.text || "").trim();
  // El mensaje puede traer otros números de 4 dígitos de paso (el año de la fecha, por ejemplo:
  // "...para el 22 sep 2026 a las 9:00 AM. PIN #7063") — el PIN de verdad va siempre después de
  // "PIN #", que es como lo arma la plantilla confirmWhatsapp. Si el negocio edita la plantilla y
  // le quita el "PIN #", cae al respaldo de tomar el ÚLTIMO número de 4 dígitos del mensaje (el
  // código casi siempre va al final).
  const pinMatch = text.match(/PIN\s*#\s*(\d{4})\b/i);
  const allMatches = [...text.matchAll(/\b(\d{4})\b/g)];
  const pin = pinMatch ? pinMatch[1] : allMatches.length ? allMatches[allMatches.length - 1][1] : null;
  if (!pin) return;

  const appt = await first(env,
    `SELECT * FROM appointments WHERE business_id=? AND status='pending_confirmation' AND confirm_channel='whatsapp'
       AND confirm_pin=? AND confirm_expires_at > ?`,
    business.id, pin, new Date().toISOString());
  if (!appt) return;

  await run(env, `UPDATE appointments SET status='confirmed', confirm_pin=NULL WHERE id=?`, appt.id);
  await markClientVerified(env, appt.client_id);
  const updated = await first(env, `SELECT * FROM appointments WHERE id=?`, appt.id);
  const service = await first(env, `SELECT name FROM services WHERE id=?`, appt.service_id);
  await sendConfirmedNotice(env, business, updated, service, origin);
}

// Una vez que un cliente confirma su primera cita (PIN por WhatsApp o link de correo), queda
// "verificado" — sus próximas reservas por WhatsApp quedan confirmadas de una, sin pedirle el PIN
// otra vez (ver POST /public/book). Ese primer número/correo ya demostró ser real y suyo.
export async function markClientVerified(env, clientId) {
  if (!clientId) return;
  await run(env, `UPDATE clients SET verified=1 WHERE id=?`, clientId);
}

// Cron: libera (cancela) las citas que quedaron pendientes de confirmar y ya vencieron. No avisa
// al cliente — ya tuvo su ventana para responder, y mandar otro WhatsApp no confirmado es
// exactamente lo que se está tratando de evitar.
export async function releaseExpiredPending(env) {
  const now = new Date().toISOString();
  const expired = await all(env,
    `SELECT id FROM appointments WHERE status='pending_confirmation' AND confirm_expires_at IS NOT NULL AND confirm_expires_at < ?`,
    now);
  for (const appt of expired) {
    await run(env, `UPDATE appointments SET status='cancelled' WHERE id=?`, appt.id);
  }
  return { released: expired.length };
}
