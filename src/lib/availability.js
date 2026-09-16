import { all, first } from "./db.js";

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Fecha/hora por defecto para el recordatorio de una cita: reminderHours antes de que empiece.
// La usan tanto la reserva pública como la creación manual, para no repetir esta cuenta dos veces.
export function reminderDateTime(date, start, reminderHours) {
  const dt = new Date(`${date}T${start}:00`);
  dt.setHours(dt.getHours() - reminderHours);
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, "0"), d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0"), mm = String(dt.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

// Horario efectivo de un día para el negocio o para un especialista puntual (respeta excepciones).
async function effectiveHours(env, business, date, specialistId) {
  const specialistEx = specialistId
    ? await first(env, `SELECT * FROM date_exceptions WHERE business_id=? AND specialist_id=? AND date=?`,
        business.id, specialistId, date)
    : null;
  const businessEx = await first(env, `SELECT * FROM date_exceptions WHERE business_id=? AND specialist_id IS NULL AND date=?`,
    business.id, date);
  const ex = specialistEx || businessEx;
  if (ex) return ex.closed ? null : { open: ex.open_hour, close: ex.close_hour };

  const openDays = JSON.parse(business.open_days || "[1,2,3,4,5,6]");
  const dow = new Date(date + "T00:00:00").getDay();
  if (!openDays.includes(dow)) return null;
  return { open: business.open_hour, close: business.close_hour };
}

// Calcula los horarios de inicio disponibles (grilla de 15 min) para un servicio+especialista+fecha.
export async function availableSlots(env, business, { serviceId, specialistId, date }) {
  const service = await first(env, `SELECT * FROM services WHERE business_id=? AND id=?`, business.id, serviceId);
  if (!service) return { error: "Servicio no encontrado" };

  const hours = await effectiveHours(env, business, date, specialistId);
  if (!hours) return { slots: [] };

  const busy = [];
  const appts = await all(env,
    `SELECT start, end FROM appointments WHERE business_id=? AND specialist_id=? AND date=? AND status IN ('confirmed','completed')`,
    business.id, specialistId, date);
  const blocks = await all(env,
    `SELECT start, end FROM blocks WHERE business_id=? AND specialist_id=? AND date=?`,
    business.id, specialistId, date);
  for (const row of [...appts, ...blocks]) busy.push([toMin(row.start), toMin(row.end)]);

  const step = 15;
  const startMin = hours.open * 60;
  const endMin = hours.close * 60;
  const slots = [];
  for (let t = startMin; t + service.duration_min <= endMin; t += step) {
    const overlaps = busy.some(([bs, be]) => t < be && t + service.duration_min > bs);
    if (!overlaps) slots.push(toHHMM(t));
  }
  return { slots, durationMin: service.duration_min };
}
