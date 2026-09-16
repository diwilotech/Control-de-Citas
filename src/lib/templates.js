// Plantillas por defecto que se siembran al crear un negocio (editables luego en /staff/templates).
// Placeholders: {cliente} {servicio} {fecha} {hora} {fechaNueva} {horaNueva}
export const DEFAULT_TEMPLATES = {
  booked: "Hola {cliente}, tu cita de {servicio} quedó agendada para el {fecha} a las {hora}. ¡Te esperamos!",
  cancel: "Hola {cliente}, tu cita de {servicio} del {fecha} a las {hora} ha sido cancelada. Contáctanos para agendar una nueva.",
  reschedule: "Hola {cliente}, necesitamos reprogramar tu cita de {servicio} del {fecha} a las {hora}. Por favor elige un nuevo horario cuando puedas.",
  move: "Hola {cliente}, te proponemos mover tu cita de {servicio} del {fecha} {hora} a {fechaNueva} {horaNueva}. ¿Nos confirmas si te queda bien?",
  reopen: "Hola {cliente}, vimos que tu cita de {servicio} del {fecha} quedó cancelada. ¿Quieres que te ayudemos a agendar una nueva fecha?",
  reminder: "Hola {cliente}, te recordamos tu cita de {servicio} el {fecha} a las {hora}. ¡Te esperamos!",
};

export function formatDateHuman(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${String(d).padStart(2, "0")} ${meses[m - 1]} ${y}`;
}
export function formatAmPm(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function fillTemplate(body, vars) {
  let text = body || "";
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`{${key}}`).join(value ?? "");
  }
  return text;
}
