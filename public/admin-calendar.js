// Calendario mensual: cuadrícula con horario/personal por día, apertura y cierre del negocio,
// y el modal de vista previa del día (reusa Agenda.buildDaySchedule, no repite esa lógica).
window.MonthCalendar = (function () {
  const { api, toast, formatAMPM, formatDateHuman, formatHourAMPM, dateToISO, todayISO } = window.CDC;
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const DOW_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DOW_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const today = new Date();
  let viewYear = today.getFullYear(), viewMonth = today.getMonth();
  let businessCache = null, exceptionsCache = [], specialistsCache = [], apptsCache = [];
  let editingDayISO = null;
  let bulkPending = null;

  function prev() { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); }
  function next() { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); }

  function hourAmPm(h) { const suffix = h < 12 ? "a" : "p"; let h12 = h % 12; if (h12 === 0) h12 = 12; return h12 + suffix; }

  // El grid muestra el horario general del negocio (no el de un especialista puntual).
  function dayHours(iso, dow) {
    const businessEx = exceptionsCache.find((e) => !e.specialist_id && e.date === iso);
    if (businessEx) return businessEx.closed ? { closed: true } : { closed: false, open: businessEx.open_hour, close: businessEx.close_hour };
    const openDays = JSON.parse(businessCache.open_days || "[1,2,3,4,5,6]");
    if (!openDays.includes(dow)) return { closed: true };
    return { closed: false, open: businessCache.open_hour, close: businessCache.close_hour };
  }

  function isWorking(specialistId, iso) {
    return !exceptionsCache.some((e) => e.specialist_id === specialistId && e.date === iso && e.closed);
  }

  async function render() {
    [businessCache, exceptionsCache, specialistsCache] = await Promise.all([
      api("/staff/settings").catch(() => null),
      api("/staff/date-exceptions").catch(() => []),
      api("/staff/specialists").catch(() => []),
    ]);
    document.getElementById("monthLabel").textContent = `${MESES[viewMonth]} ${viewYear}`;
    document.getElementById("monthLegend").innerHTML = specialistsCache.map((sp) =>
      `<span class="legend-chip"><span class="staff-dot" style="background:${sp.color};cursor:default;">${sp.avatar}</span> ${sp.name}</span>`).join("");
    renderBusinessHours();

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);

    apptsCache = await api(`/staff/appointments?from=${dateToISO(gridStart)}&to=${dateToISO(gridEnd)}`).catch(() => []);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
      const iso = dateToISO(d);
      const outside = d.getMonth() !== viewMonth;
      const isToday = iso === todayISO();
      const hours = dayHours(iso, d.getDay());
      const hasOverride = exceptionsCache.some((e) => !e.specialist_id && e.date === iso);

      const dots = specialistsCache.map((sp) => {
        const working = isWorking(sp.id, iso);
        return `<button type="button" class="staff-dot ${working ? "" : "off"}" style="${working ? `background:${sp.color}` : ""}"
          title="${sp.name} ${working ? "trabaja" : "libre"} (clic para cambiar)" data-sp="${sp.id}" data-date="${iso}">${sp.avatar}</button>`;
      }).join("");

      const apptColors = [...new Set(apptsCache.filter((a) => a.date === iso && a.status !== "cancelled").map((a) => a.specialist_color))];
      const apptLines = apptColors.length
        ? `<div class="day-appt-lines">${apptColors.map((c) => `<span class="day-appt-line" style="background:${c}"></span>`).join("")}</div>` : "";

      cells.push(`<div class="day-cell ${outside ? "outside" : ""} ${isToday ? "today" : ""} ${hours.closed ? "day-closed" : ""}" data-date="${iso}">
        <div class="d-flex justify-content-between align-items-center">
          <span class="day-num">${d.getDate()}</span>
          <span class="day-hours-btn ${hasOverride ? "has-override" : ""}">${hours.closed ? "Cerrado" : `${hourAmPm(hours.open)}-${hourAmPm(hours.close)}`}</span>
        </div>
        ${apptLines}
        <div class="staff-dots">${dots}</div>
      </div>`);
    }
    document.getElementById("monthGrid").innerHTML = cells.join("");

    document.querySelectorAll(".day-cell").forEach((el) => (el.onclick = () => openDayPreview(el.dataset.date)));
    document.querySelectorAll(".staff-dot[data-sp]").forEach((el) => (el.onclick = (e) => {
      e.stopPropagation();
      toggleWorking(el.dataset.sp, el.dataset.date);
    }));
  }

  /* ---------- Apertura y cierre del negocio ---------- */
  function renderBusinessHours() {
    const openDays = JSON.parse(businessCache.open_days || "[1,2,3,4,5,6]");
    document.getElementById("businessDaysChips").innerHTML = DOW_SHORT.map((label, dow) =>
      `<span class="chip ${openDays.includes(dow) ? "active" : ""}" data-dow="${dow}">${label}</span>`).join("");
    document.querySelectorAll("#businessDaysChips .chip").forEach((el) => (el.onclick = () => toggleBusinessDay(Number(el.dataset.dow))));
    document.getElementById("businessOpenHour").value = businessCache.open_hour;
    document.getElementById("businessCloseHour").value = businessCache.close_hour;
  }

  async function toggleBusinessDay(dow) {
    const openDays = JSON.parse(businessCache.open_days || "[1,2,3,4,5,6]");
    const idx = openDays.indexOf(dow);
    if (idx >= 0) openDays.splice(idx, 1); else openDays.push(dow);
    businessCache = await api("/staff/settings", { method: "PATCH", body: { openDays } });
    renderBusinessHours();
    render();
  }

  document.getElementById("businessHoursSaveBtn").onclick = async () => {
    const openHour = Number(document.getElementById("businessOpenHour").value);
    const closeHour = Number(document.getElementById("businessCloseHour").value);
    businessCache = await api("/staff/settings", { method: "PATCH", body: { openHour, closeHour } });
    toast("Horario del negocio guardado.");
    render();
  };

  /* ---------- Vista previa del día ---------- */
  let dayPreviewModal = null;

  async function populateDayPreview(iso) {
    const [y, m, dNum] = iso.split("-").map(Number);
    const d = new Date(y, m - 1, dNum);
    document.getElementById("dayPreviewTitle").textContent = `${DOW_FULL[d.getDay()]} ${dNum} de ${MESES[m - 1]} ${y}`.replace(/^./, (c) => c.toUpperCase());

    const hours = dayHours(iso, d.getDay());
    document.getElementById("editDayClosed").checked = hours.closed;
    document.getElementById("editDayOpen").value = hours.closed ? businessCache.open_hour : hours.open;
    document.getElementById("editDayClose").value = hours.closed ? businessCache.close_hour : hours.close;
    document.getElementById("dayPreviewResetBtn").style.display = exceptionsCache.some((e) => !e.specialist_id && e.date === iso) ? "inline-block" : "none";
    toggleDayHourInputs();

    document.getElementById("dayPreviewStaffList").innerHTML = specialistsCache.map((sp) => {
      const working = isWorking(sp.id, iso);
      return `<button type="button" class="chip ${working ? "active" : ""}" data-sp="${sp.id}">
        <span class="mini-avatar" style="background:${sp.color}">${sp.avatar}</span> ${sp.name}${working ? "" : '<span class="text-muted"> · libre</span>'}
      </button>`;
    }).join("");
    document.querySelectorAll("#dayPreviewStaffList .chip").forEach((el) => (el.onclick = () => toggleWorking(el.dataset.sp, iso)));

    const { headHtml, bodyHtml, count } = await window.Agenda.buildDaySchedule(iso, specialistsCache);
    document.getElementById("dayPreviewCount").textContent = `${count} cita${count === 1 ? "" : "s"}`;
    document.getElementById("dayPreviewHead").innerHTML = headHtml;
    document.getElementById("dayPreviewBody").innerHTML = bodyHtml;
  }

  function openDayPreview(iso) {
    editingDayISO = iso;
    populateDayPreview(iso);
    dayPreviewModal = dayPreviewModal || new bootstrap.Modal(document.getElementById("dayPreviewModal"));
    dayPreviewModal.show();
  }

  function toggleDayHourInputs() {
    const closed = document.getElementById("editDayClosed").checked;
    document.getElementById("editDayOpen").disabled = closed;
    document.getElementById("editDayClose").disabled = closed;
  }
  document.getElementById("editDayClosed").onchange = toggleDayHourInputs;

  document.getElementById("dayPreviewSaveHoursBtn").onclick = async () => {
    const closed = document.getElementById("editDayClosed").checked;
    const openHour = Number(document.getElementById("editDayOpen").value);
    const closeHour = Number(document.getElementById("editDayClose").value);
    await api("/staff/date-exceptions", { method: "POST", body: { date: editingDayISO, closed, openHour, closeHour } });
    toast("Horario de ese día actualizado.");
    await render();
    await populateDayPreview(editingDayISO);
  };

  document.getElementById("dayPreviewResetBtn").onclick = async () => {
    const ex = exceptionsCache.find((e) => !e.specialist_id && e.date === editingDayISO);
    if (ex) await api(`/staff/date-exceptions/${ex.id}`, { method: "DELETE" });
    toast("Se restableció el horario general para ese día.");
    await render();
    await populateDayPreview(editingDayISO);
  };

  /* ---------- Marcar especialista libre/trabaja un día ---------- */
  let bulkModal = null;

  async function toggleWorking(specialistId, iso) {
    const sp = specialistsCache.find((s) => s.id === specialistId);
    if (!sp) return;

    if (!isWorking(specialistId, iso)) {
      // Ya está libre: volver a activarlo es solo borrar la excepción.
      const ex = exceptionsCache.find((e) => e.specialist_id === specialistId && e.date === iso);
      if (ex) await api(`/staff/date-exceptions/${ex.id}`, { method: "DELETE" });
      toast(`${sp.name} vuelve a trabajar ese día.`);
      await render();
      if (editingDayISO === iso) await populateDayPreview(iso);
      return;
    }

    const affected = apptsCache.filter((a) => a.specialist_id === specialistId && a.date === iso && ["confirmed", "reagendar"].includes(a.status));
    if (!affected.length) {
      await applyDayOff(specialistId, iso, false);
      return;
    }

    bulkPending = { specialistId, iso };
    document.getElementById("bulkReagendarSpName").textContent = sp.name;
    document.getElementById("bulkReagendarDate").textContent = formatDateHuman(iso);
    document.getElementById("bulkReagendarList").innerHTML = affected.map((a) => `
      <div class="d-flex justify-content-between align-items-center border-top py-2">
        <div><div class="fw-semibold">${a.client_name}</div><div class="text-muted small">${a.service_name}</div></div>
        <span class="text-muted small">${formatAMPM(a.start)}</span>
      </div>`).join("");
    bulkModal = bulkModal || new bootstrap.Modal(document.getElementById("bulkReagendarModal"));
    bulkModal.show();
  }

  async function applyDayOff(specialistId, iso, notify) {
    const sp = specialistsCache.find((s) => s.id === specialistId);
    const { affectedCount } = await api(`/staff/specialists/${specialistId}/day-off`, { method: "POST", body: { date: iso, notify } });
    toast(affectedCount ? `${sp.name} libre. ${affectedCount} cita(s) pasaron a "por reagendar"${notify ? " y se avisó por WhatsApp" : ""}.` : `${sp.name} marcado como libre ese día.`);
    await render();
    if (editingDayISO === iso) await populateDayPreview(iso);
  }

  document.getElementById("bulkReagendarCancelBtn").onclick = () => { bulkPending = null; bulkModal.hide(); };
  document.getElementById("bulkReagendarCancelX").onclick = () => { bulkPending = null; };
  document.getElementById("bulkReagendarNoNotifyBtn").onclick = async () => {
    if (!bulkPending) return;
    const { specialistId, iso } = bulkPending; bulkPending = null;
    bulkModal.hide();
    await applyDayOff(specialistId, iso, false);
  };
  document.getElementById("bulkReagendarConfirmBtn").onclick = async () => {
    if (!bulkPending) return;
    const { specialistId, iso } = bulkPending; bulkPending = null;
    bulkModal.hide();
    await applyDayOff(specialistId, iso, true);
  };

  document.getElementById("monthPrevBtn").onclick = prev;
  document.getElementById("monthNextBtn").onclick = next;

  return { render, prev, next };
})();
