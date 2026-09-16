// Flujo: métricas de operación e ingresos, consumiendo GET /staff/flujo. Los gráficos (donut y
// barras) son SVG puro, sin librerías — se calculan acá mismo, no hay nada más que reusar.
window.Flujo = (function () {
  const { api } = window.CDC;

  function money(n) { return "$" + Number(n || 0).toLocaleString("es-CO"); }

  function donut(container, { total, segments, centerLabel, centerSub }) {
    const size = 160, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    let offset = 0;
    const arcs = segments.map((seg) => {
      const frac = total > 0 ? seg.value / total : 0;
      const dash = frac * c;
      const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
        stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += dash;
      return el;
    });
    container.innerHTML = `<svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#f0eee6" stroke-width="${stroke}"/>${arcs.join("")}
    </svg><div class="center-label"><span class="metric-value" style="font-size:1.5rem;">${centerLabel}</span><span class="small text-muted">${centerSub}</span></div>`;
  }

  function bars(container, data, formatValue) {
    const max = Math.max(...data.map((d) => d.value), 1);
    container.innerHTML = data.map((d) => {
      const h = Math.max(6, Math.round((d.value / max) * 100));
      return `<div class="bar-col">
        <span class="small text-muted" style="font-size:.65rem;">${formatValue(d.value)}</span>
        <div class="bar-fill" style="height:${h}%"></div>
        <span class="small fw-semibold text-muted" style="font-size:.65rem;">${d.label}</span>
      </div>`;
    }).join("");
  }

  async function render() {
    const f = await api("/staff/flujo").catch(() => null);
    if (!f) return;

    document.getElementById("activeAgendaCount").textContent = f.activeToday;
    document.getElementById("flujoToday").textContent = money(f.todayRevenue);
    const delta = f.yesterdayRevenue > 0 ? Math.round(((f.todayRevenue - f.yesterdayRevenue) / f.yesterdayRevenue) * 100) : 0;
    document.getElementById("flujoDelta").innerHTML = `<span style="color:${delta >= 0 ? "var(--primary)" : "var(--danger)"}">
      <i class="bi bi-arrow-${delta >= 0 ? "up" : "down"}-right"></i> ${Math.abs(delta)}% vs ayer</span>`;
    document.getElementById("flujoPending").textContent = f.pendingPayments;

    document.getElementById("noShowRateValue").textContent = f.noShowRate.value + "%";
    const nsDelta = Math.round((f.noShowRate.value - f.noShowRate.previousValue) * 10) / 10;
    document.getElementById("noShowRateDelta").innerHTML = `<span style="color:${nsDelta <= 0 ? "var(--primary)" : "var(--danger)"}">
      <i class="bi bi-arrow-${nsDelta <= 0 ? "down" : "up"}-right"></i> ${Math.abs(nsDelta)}% vs período anterior</span>`;

    const sc = f.statusCounts;
    const totalStatus = sc.completed + sc.pending + sc.cancelledOrNoShow;
    donut(document.getElementById("statusDonut"), {
      total: totalStatus, centerLabel: totalStatus, centerSub: "Citas (30 días)",
      segments: [
        { value: sc.completed, color: "#12211f" },
        { value: sc.pending, color: "rgba(15,82,87,.35)" },
        { value: sc.cancelledOrNoShow, color: "#c0472f" },
      ],
    });

    const dows = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    bars(document.getElementById("flujoBars"),
      f.last7Days.map((d) => ({ label: dows[new Date(d.date + "T00:00:00").getDay()], value: d.revenue })),
      (v) => "$" + Math.round(v / 1000) + "k");

    const maxService = Math.max(...f.byService.map((s) => s.revenue), 1);
    document.getElementById("flujoByService").innerHTML = f.byService.length ? f.byService.map((s) => `
      <div>
        <div class="d-flex justify-content-between small mb-1"><span class="fw-semibold">${s.service}</span><span class="text-muted">${money(s.revenue)}</span></div>
        <div class="progress" style="height:8px;border-radius:6px;"><div class="progress-bar" style="width:${(s.revenue / maxService) * 100}%;background:var(--accent);"></div></div>
      </div>`).join("") : `<p class="text-muted small mb-0">Todavía no hay citas completadas.</p>`;
  }

  return { render };
})();
