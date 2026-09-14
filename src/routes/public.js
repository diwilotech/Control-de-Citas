import { all, first, run, uid } from "../lib/db.js";
import { json, error, readJson } from "../lib/http.js";
import { availableSlots } from "../lib/availability.js";
import { sendApptMessage } from "../lib/messages.js";

// Endpoints públicos para la página de reserva del cliente (sin login).
export function registerPublic(router) {
  router.get("/api/:slug/public/business", async (request, env, ctx) => {
    const services = await all(env, `SELECT id, name, duration_min, price FROM services WHERE business_id=?`, ctx.business.id);
    const specialists = await all(env,
      `SELECT id, name, avatar, color FROM specialists WHERE business_id=?`, ctx.business.id);
    const links = await all(env,
      `SELECT specialist_id, service_id FROM specialist_services ss
       JOIN specialists s ON s.id = ss.specialist_id WHERE s.business_id=?`, ctx.business.id);
    const byService = {};
    for (const l of links) (byService[l.service_id] ||= []).push(l.specialist_id);

    return json({
      name: ctx.business.name,
      openHour: ctx.business.open_hour,
      closeHour: ctx.business.close_hour,
      services,
      specialists,
      specialistsByService: byService,
    });
  });

  router.get("/api/:slug/public/availability", async (request, env, ctx) => {
    const url = new URL(request.url);
    const serviceId = url.searchParams.get("serviceId");
    const specialistId = url.searchParams.get("specialistId");
    const date = url.searchParams.get("date");
    if (!serviceId || !specialistId || !date) return error("Faltan serviceId, specialistId o date.");
    return json(await availableSlots(env, ctx.business, { serviceId, specialistId, date }));
  });

  router.post("/api/:slug/public/book", async (request, env, ctx) => {
    const body = await readJson(request);
    const { serviceId, specialistId, date, start, clientName, clientEmail, clientPhone } = body;
    if (!serviceId || !specialistId || !date || !start || !clientName) return error("Faltan datos de la reserva.");

    const service = await first(env, `SELECT * FROM services WHERE business_id=? AND id=?`, ctx.business.id, serviceId);
    if (!service) return error("Servicio no encontrado.", 404);

    const { slots } = await availableSlots(env, ctx.business, { serviceId, specialistId, date });
    if (!slots.includes(start)) return error("Ese horario ya no está disponible; elige otro.", 409);

    let client = clientPhone
      ? await first(env, `SELECT * FROM clients WHERE business_id=? AND phone=?`, ctx.business.id, clientPhone)
      : null;
    if (!client) {
      const clientId = uid();
      await run(env, `INSERT INTO clients (id, business_id, name, email, phone) VALUES (?,?,?,?,?)`,
        clientId, ctx.business.id, clientName, clientEmail || null, clientPhone || null);
      client = { id: clientId };
    }

    const endMin = toMin(start) + service.duration_min;
    const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    const apptId = uid();
    await run(env,
      `INSERT INTO appointments (id, business_id, client_id, client_name, client_email, client_phone,
        specialist_id, service_id, date, start, end, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'confirmed')`,
      apptId, ctx.business.id, client.id, clientName, clientEmail || null, clientPhone || null,
      specialistId, serviceId, date, start, end);

    const appt = await first(env, `SELECT * FROM appointments WHERE id=?`, apptId);
    if (appt.client_phone) await sendApptMessage(env, ctx.business, appt, "booked", { serviceName: service.name });

    return json({ appointment: appt }, { status: 201 });
  });
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
