import { all, first } from "./db.js";
import { sendApptMessage } from "./messages.js";

// Corre cada 15 min (ver wrangler.toml). Busca, en todos los negocios, citas confirmadas cuyo
// recordatorio ya venció (dentro de una ventana de 20 min, para no perder ninguna ni reenviar) y
// que todavía no tengan un mensaje "reminder" registrado (evita duplicados si el cron se solapa).
export async function sendDueReminders(env) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 20 * 60 * 1000);
  const todayIso = now.toISOString().slice(0, 10);
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const windowStartIso = windowStart.toISOString().slice(0, 10);
  const windowStartHHMM = `${String(windowStart.getHours()).padStart(2, "0")}:${String(windowStart.getMinutes()).padStart(2, "0")}`;

  const due = await all(env,
    `SELECT a.* FROM appointments a
     WHERE a.status = 'confirmed'
       AND a.confirmation_date IS NOT NULL AND a.confirmation_time IS NOT NULL
       AND (a.confirmation_date || ' ' || a.confirmation_time) <= ?
       AND (a.confirmation_date || ' ' || a.confirmation_time) >= ?
       AND NOT EXISTS (
         SELECT 1 FROM appointment_messages m WHERE m.appointment_id = a.id AND m.template_key = 'reminder'
       )`,
    `${todayIso} ${nowHHMM}`, `${windowStartIso} ${windowStartHHMM}`);

  let sent = 0;
  for (const appt of due) {
    const business = await first(env, `SELECT * FROM businesses WHERE id=?`, appt.business_id);
    if (!business) continue;
    const service = await first(env, `SELECT name FROM services WHERE id=?`, appt.service_id);
    const result = await sendApptMessage(env, business, appt, "reminder", { serviceName: service?.name });
    if (result.ok) sent++;
  }
  return { checked: due.length, sent };
}
