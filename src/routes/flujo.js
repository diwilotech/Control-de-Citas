import { all, first } from "../lib/db.js";
import { json } from "../lib/http.js";

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Ingresos = suma del precio del servicio de las citas completadas (lo único que cuenta como
// "pasó de verdad"). No hay pasarela de pago; "pagado" es un check manual del staff.
export function registerFlujo(router) {
  router.get("/api/:slug/staff/flujo", async (request, env, ctx) => {
    const businessId = ctx.business.id;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = addDays(today, -1);
    const weekAgo = addDays(today, -6);
    const monthAgo = addDays(today, -29);
    const prevMonthAgo = addDays(today, -59);

    const revenueOn = async (date) => {
      const row = await first(env,
        `SELECT COALESCE(SUM(sv.price),0) AS revenue FROM appointments a
         JOIN services sv ON sv.id = a.service_id
         WHERE a.business_id=? AND a.date=? AND a.status='completed'`, businessId, date);
      return row.revenue;
    };

    const [todayRevenue, yesterdayRevenue, activeToday, pendingRow, last7Rows, byServiceRows, noShowNow, noShowPrev] =
      await Promise.all([
        revenueOn(today),
        revenueOn(yesterday),
        first(env, `SELECT COUNT(*) AS n FROM appointments WHERE business_id=? AND date=? AND status='confirmed'`, businessId, today)
          .then((r) => r.n),
        first(env, `SELECT COUNT(*) AS n FROM appointments WHERE business_id=? AND status='completed' AND paid=0`, businessId),
        all(env,
          `SELECT a.date, COALESCE(SUM(sv.price),0) AS revenue FROM appointments a
           JOIN services sv ON sv.id = a.service_id
           WHERE a.business_id=? AND a.status='completed' AND a.date BETWEEN ? AND ?
           GROUP BY a.date`, businessId, weekAgo, today),
        all(env,
          `SELECT sv.name AS service, COALESCE(SUM(sv.price),0) AS revenue FROM appointments a
           JOIN services sv ON sv.id = a.service_id
           WHERE a.business_id=? AND a.status='completed' AND a.date BETWEEN ? AND ?
           GROUP BY sv.id ORDER BY revenue DESC`, businessId, monthAgo, today),
        first(env,
          `SELECT SUM(CASE WHEN status='no-show' THEN 1 ELSE 0 END) AS noShow, COUNT(*) AS total
           FROM appointments WHERE business_id=? AND date BETWEEN ? AND ? AND status IN ('completed','no-show')`,
          businessId, monthAgo, today),
        first(env,
          `SELECT SUM(CASE WHEN status='no-show' THEN 1 ELSE 0 END) AS noShow, COUNT(*) AS total
           FROM appointments WHERE business_id=? AND date BETWEEN ? AND ? AND status IN ('completed','no-show')`,
          businessId, prevMonthAgo, addDays(monthAgo, -1)),
      ]);

    const revenueByDate = Object.fromEntries(last7Rows.map((r) => [r.date, r.revenue]));
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekAgo, i);
      return { date, revenue: revenueByDate[date] || 0 };
    });

    const rate = (row) => (row.total ? Math.round((row.noShow / row.total) * 1000) / 10 : 0);

    return json({
      todayRevenue, yesterdayRevenue, activeToday,
      pendingPayments: pendingRow.n,
      noShowRate: { value: rate(noShowNow), previousValue: rate(noShowPrev) },
      last7Days,
      byService: byServiceRows,
    });
  });
}
