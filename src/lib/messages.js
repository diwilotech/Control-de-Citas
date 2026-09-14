import { first, run, uid } from "./db.js";
import { sendWhatsApp } from "./whatsapp.js";
import { DEFAULT_TEMPLATES, fillTemplate, formatDateHuman, formatAmPm } from "./templates.js";

// Punto único para avisar por WhatsApp sobre una cita (cancelar/reagendar/mover/reabrir/agendada).
// Reutilizado por todas las acciones de citas para no repetir la lógica de plantilla + envío + registro.
export async function sendApptMessage(env, business, appt, templateKey, extra = {}) {
  const tpl = await first(env, `SELECT body FROM message_templates WHERE business_id = ? AND key = ?`,
    business.id, templateKey);
  const body = tpl ? tpl.body : DEFAULT_TEMPLATES[templateKey];

  const text = fillTemplate(body, {
    cliente: appt.client_name,
    servicio: extra.serviceName || "",
    fecha: formatDateHuman(appt.date),
    hora: formatAmPm(appt.start),
    fechaNueva: extra.date ? formatDateHuman(extra.date) : "",
    horaNueva: extra.start ? formatAmPm(extra.start) : "",
    negocio: business.name,
    codigo: extra.codigo || "",
  });

  const result = appt.client_phone
    ? await sendWhatsApp(env, business, appt.client_phone, text)
    : { ok: false, error: "El cliente no tiene celular registrado." };

  await run(env,
    `INSERT INTO appointment_messages (id, appointment_id, business_id, template_key, body, status) VALUES (?,?,?,?,?,?)`,
    uid(), appt.id, business.id, templateKey, text, result.ok ? "sent" : "failed");

  return result;
}
