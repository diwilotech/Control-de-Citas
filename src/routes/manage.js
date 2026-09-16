import { all, first, run } from "../lib/db.js";
import { json, error, notFound } from "../lib/http.js";
import { ensureManageToken, sendConfirmedNotice, sendSelfServiceNotice } from "../lib/confirm.js";

// Rutas públicas (sin sesión de staff) para que el cliente confirme su cita por correo y para la
// página "mis citas" (ver/cancelar/pedir reagendar) — mismo estilo que public.js.
function withinCancelWindow(appt) {
  const startMs = new Date(`${appt.date}T${appt.start}:00`).getTime();
  return startMs - Date.now() < (appt.cancel_window_hours || 0) * 3600000;
}

export function registerManage(router) {
  // Clic en el link de confirmación que llega por correo.
  router.get("/api/:slug/public/confirm-email/:apptId/:token", async (request, env, ctx) => {
    const appt = await first(env, `SELECT * FROM appointments WHERE business_id=? AND id=?`, ctx.business.id, ctx.params.apptId);
    const manageUrl = new URL(`/${ctx.business.slug}/mis-citas`, request.url);

    if (!appt || appt.confirm_token !== ctx.params.token || appt.status !== "pending_confirmation") {
      manageUrl.searchParams.set("err", "confirm");
      return Response.redirect(manageUrl.toString(), 302);
    }
    if (appt.confirm_expires_at && new Date(appt.confirm_expires_at) < new Date()) {
      manageUrl.searchParams.set("err", "expired");
      return Response.redirect(manageUrl.toString(), 302);
    }

    await run(env, `UPDATE appointments SET status='confirmed', confirm_token=NULL WHERE id=?`, appt.id);
    const updated = await first(env, `SELECT * FROM appointments WHERE id=?`, appt.id);
    const service = await first(env, `SELECT name FROM services WHERE id=?`, appt.service_id);
    await sendConfirmedNotice(env, ctx.business, updated, service, new URL(request.url).origin);

    const manageToken = await ensureManageToken(env, appt.client_id);
    manageUrl.searchParams.set("t", manageToken);
    manageUrl.searchParams.set("justConfirmed", "1");
    return Response.redirect(manageUrl.toString(), 302);
  });

  router.get("/api/:slug/public/my-appointments/:token", async (request, env, ctx) => {
    const client = await first(env, `SELECT * FROM clients WHERE business_id=? AND manage_token=?`, ctx.business.id, ctx.params.token);
    if (!client) return notFound();
    const appointments = await all(env,
      `SELECT a.*, sp.name AS specialist_name, sv.name AS service_name, sv.cancel_window_hours
       FROM appointments a JOIN specialists sp ON sp.id=a.specialist_id JOIN services sv ON sv.id=a.service_id
       WHERE a.client_id=? ORDER BY a.date DESC, a.start DESC`, client.id);
    return json({ client: { name: client.name }, business: { name: ctx.business.name }, appointments });
  });

  router.post("/api/:slug/public/my-appointments/:token/:apptId/cancel", async (request, env, ctx) => {
    const client = await first(env, `SELECT * FROM clients WHERE business_id=? AND manage_token=?`, ctx.business.id, ctx.params.token);
    if (!client) return notFound();
    const appt = await first(env,
      `SELECT a.*, sv.cancel_window_hours, sv.name AS service_name FROM appointments a JOIN services sv ON sv.id=a.service_id
       WHERE a.id=? AND a.client_id=?`, ctx.params.apptId, client.id);
    if (!appt) return notFound();
    if (!["confirmed", "pending_confirmation", "reagendar"].includes(appt.status)) return error("Esta cita ya no se puede cancelar.", 409);
    if (withinCancelWindow(appt)) return error(`Ya no se puede cancelar en línea (menos de ${appt.cancel_window_hours}h antes de la cita) — contacta al negocio.`, 409);

    await run(env, `UPDATE appointments SET status='cancelled' WHERE id=?`, appt.id);
    const updated = await first(env, `SELECT * FROM appointments WHERE id=?`, appt.id);
    await sendSelfServiceNotice(env, ctx.business, updated, { name: appt.service_name }, "selfCancel");
    return json({ ok: true });
  });

  router.post("/api/:slug/public/my-appointments/:token/:apptId/reschedule", async (request, env, ctx) => {
    const client = await first(env, `SELECT * FROM clients WHERE business_id=? AND manage_token=?`, ctx.business.id, ctx.params.token);
    if (!client) return notFound();
    const appt = await first(env,
      `SELECT a.*, sv.cancel_window_hours, sv.name AS service_name FROM appointments a JOIN services sv ON sv.id=a.service_id
       WHERE a.id=? AND a.client_id=?`, ctx.params.apptId, client.id);
    if (!appt) return notFound();
    if (!["confirmed", "pending_confirmation"].includes(appt.status)) return error("Esta cita ya no se puede reagendar.", 409);
    if (withinCancelWindow(appt)) return error(`Ya no se puede reagendar en línea (menos de ${appt.cancel_window_hours}h antes de la cita) — contacta al negocio.`, 409);

    await run(env, `UPDATE appointments SET status='reagendar', space_id=NULL WHERE id=?`, appt.id);
    const updated = await first(env, `SELECT * FROM appointments WHERE id=?`, appt.id);
    await sendSelfServiceNotice(env, ctx.business, updated, { name: appt.service_name }, "selfReschedule");
    return json({ ok: true });
  });
}
