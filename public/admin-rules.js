// Reglas de negocio: plantillas de mensajes, servicios y especialistas (con sus modales de
// editar/añadir). Las columnas allowed_space_types/work_days y la tabla puente
// specialist_services ya existían en el backend — esto solo les pone interfaz.
window.Rules = (function () {
  const { api, toast } = window.CDC;
  const TEMPLATE_LABELS = { booked: "Cita agendada", cancel: "Cancelación", reschedule: "Pedir reagendar", move: "Mover cita", reopen: "Reabrir cita", reminder: "Recordatorio" };

  let servicesCache = [], specialistsCache = [], spaceTypesCache = [];
  let editServiceModal = null, editSpecialistModal = null;
  let editingServiceId = null, editingSpecialistId = null;

  function typeLabel(key) { return spaceTypesCache.find((t) => t.key === key)?.label || key; }

  async function render() {
    await renderTemplates();
    await renderSpaceTypes();
    await renderServices();
    await renderSpecialists();
  }

  /* ---------- Tipos de espacio ---------- */
  function slugify(label) {
    return label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tipo";
  }

  async function renderSpaceTypes() {
    spaceTypesCache = await api("/staff/space-types").catch(() => []);
    document.getElementById("spaceTypesList").innerHTML = spaceTypesCache.length ? spaceTypesCache.map((t) => `
      <span class="badge rounded-pill d-inline-flex align-items-center gap-2" style="background:#f0eee6;color:var(--ink);font-size:.82rem;padding:.4rem .7rem;">
        ${t.label}
        <button type="button" class="btn-close" style="font-size:.55rem;" data-del-type="${t.id}" aria-label="Eliminar"></button>
      </span>`).join("") : `<p class="text-muted small mb-0">Sin tipos todavía — añade el primero abajo.</p>`;
    document.querySelectorAll("[data-del-type]").forEach((el) => (el.onclick = async () => {
      if (!confirm("¿Eliminar este tipo de espacio? Los espacios/servicios que ya lo usan quedan con una referencia suelta.")) return;
      await api(`/staff/space-types/${el.dataset.delType}`, { method: "DELETE" });
      renderSpaceTypes();
    }));
  }

  document.getElementById("addSpaceTypeBtn").onclick = async () => {
    const input = document.getElementById("newSpaceTypeLabel");
    const label = input.value.trim();
    if (!label) return toast("Escribe un nombre.", false);
    try {
      await api("/staff/space-types", { method: "POST", body: { key: slugify(label), label } });
      input.value = "";
      renderSpaceTypes();
    } catch (e) { toast(e.message, false); }
  };

  /* ---------- Plantillas ---------- */
  async function renderTemplates() {
    const templates = await api("/staff/templates").catch(() => ({}));
    document.getElementById("templatesForm").innerHTML = Object.entries(templates).map(([key, body]) => `
      <div class="col-md-4">
        <label class="label-xs d-block mb-1">${TEMPLATE_LABELS[key] || key}</label>
        <textarea class="form-control" rows="4" data-key="${key}">${body}</textarea>
      </div>`).join("") + `<div class="col-12"><button class="btn btn-brand btn-sm" id="saveTemplatesBtn">Guardar plantillas</button></div>`;
    document.getElementById("saveTemplatesBtn").onclick = async () => {
      for (const ta of document.querySelectorAll("#templatesForm textarea")) {
        await api("/staff/templates", { method: "PATCH", body: { key: ta.dataset.key, body: ta.value } });
      }
      toast("Plantillas guardadas.");
    };
  }

  /* ---------- Servicios ---------- */
  async function renderServices() {
    servicesCache = await api("/staff/services").catch(() => []);
    document.getElementById("servicesList").innerHTML = servicesCache.map((s) => {
      let allowed = []; try { allowed = JSON.parse(s.allowed_space_types || "[]"); } catch { allowed = []; }
      return `<div class="service-row d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="fw-semibold">${s.name}</span>
            <span class="badge rounded-pill" style="background:rgba(15,82,87,.1);color:var(--primary);">$${s.price.toLocaleString("es-CO")}</span>
          </div>
          <div class="text-muted small mt-1">${s.duration_min} min · Cancela ${s.cancel_window_hours}h antes · Recordatorio ${s.reminder_hours}h antes</div>
          <div class="d-flex flex-wrap gap-1 mt-2">
            ${allowed.length ? allowed.map((k) => `<span class="badge rounded-pill" style="background:#f0eee6;color:var(--ink);font-size:.68rem;">${typeLabel(k)}</span>`).join("")
              : `<span class="text-muted small" style="font-size:.72rem;">Admite cualquier espacio</span>`}
          </div>
        </div>
        <button class="btn btn-sm btn-outline-dark flex-shrink-0" data-edit-svc="${s.id}"><i class="bi bi-pencil"></i></button>
      </div>`;
    }).join("");
    document.querySelectorAll("[data-edit-svc]").forEach((el) => (el.onclick = () => openEditService(el.dataset.editSvc)));
  }

  function serviceTypeCheckboxes(selected) {
    if (!spaceTypesCache.length) return `<p class="text-muted small mb-0">Todavía no hay tipos de espacio — créalos arriba, en "Tipos de espacio".</p>`;
    return spaceTypesCache.map(({ key, label }) => `
      <div class="form-check"><input class="form-check-input" type="checkbox" value="${key}" id="svcType_${key}" ${selected.includes(key) ? "checked" : ""}>
      <label class="form-check-label small" for="svcType_${key}">${label}</label></div>`).join("");
  }

  function openEditService(id) {
    const s = servicesCache.find((s) => s.id === id);
    if (!s) return;
    let allowed = []; try { allowed = JSON.parse(s.allowed_space_types || "[]"); } catch { allowed = []; }
    editingServiceId = id;
    document.getElementById("editServiceModalTitle").textContent = "Editar servicio";
    document.getElementById("editServiceDeleteBtn").style.display = "inline-block";
    document.getElementById("editServiceName").value = s.name;
    document.getElementById("editServiceDuration").value = s.duration_min;
    document.getElementById("editServicePrice").value = s.price;
    document.getElementById("editServiceCancel").value = s.cancel_window_hours;
    document.getElementById("editServiceReminder").value = s.reminder_hours;
    document.getElementById("editServiceTypes").innerHTML = serviceTypeCheckboxes(allowed);
    editServiceModal = editServiceModal || new bootstrap.Modal(document.getElementById("editServiceModal"));
    editServiceModal.show();
  }

  document.getElementById("addServiceOpenBtn").onclick = () => {
    editingServiceId = null;
    document.getElementById("editServiceModalTitle").textContent = "Añadir servicio";
    document.getElementById("editServiceDeleteBtn").style.display = "none";
    document.getElementById("editServiceName").value = "";
    document.getElementById("editServiceDuration").value = 30;
    document.getElementById("editServicePrice").value = 0;
    document.getElementById("editServiceCancel").value = 4;
    document.getElementById("editServiceReminder").value = 12;
    document.getElementById("editServiceTypes").innerHTML = serviceTypeCheckboxes([]);
    editServiceModal = editServiceModal || new bootstrap.Modal(document.getElementById("editServiceModal"));
    editServiceModal.show();
  };

  function readServiceForm() {
    return {
      name: document.getElementById("editServiceName").value.trim(),
      duration_min: Math.max(0, parseInt(document.getElementById("editServiceDuration").value, 10) || 0),
      price: Math.max(0, parseInt(document.getElementById("editServicePrice").value, 10) || 0),
      cancel_window_hours: Math.max(0, parseInt(document.getElementById("editServiceCancel").value, 10) || 0),
      reminder_hours: Math.max(0, parseInt(document.getElementById("editServiceReminder").value, 10) || 0),
      allowed_space_types: Array.from(document.querySelectorAll("#editServiceTypes input:checked")).map((el) => el.value),
    };
  }

  document.getElementById("editServiceSaveBtn").onclick = async () => {
    const data = readServiceForm();
    if (!data.name) return toast("Ponle un nombre al servicio.", false);
    if (editingServiceId === null) await api("/staff/services", { method: "POST", body: data });
    else await api(`/staff/services/${editingServiceId}`, { method: "PATCH", body: data });
    editServiceModal.hide();
    toast("Servicio guardado.");
    renderServices();
  };
  document.getElementById("editServiceDeleteBtn").onclick = async () => {
    if (!confirm("¿Eliminar este servicio? No se puede deshacer.")) return;
    await api(`/staff/services/${editingServiceId}`, { method: "DELETE" });
    editServiceModal.hide();
    toast("Servicio eliminado.");
    renderServices();
  };

  /* ---------- Especialistas ---------- */
  async function renderSpecialists() {
    specialistsCache = await api("/staff/specialists").catch(() => []);
    document.getElementById("specialistsList").innerHTML = specialistsCache.map((sp) => `
      <div class="specialist-row d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="avatar-badge" style="background:${sp.color}">${sp.avatar}</span>
            <div><div class="fw-semibold">${sp.name}</div><div class="text-muted small">${sp.role || ""}</div></div>
          </div>
          <div id="svcBadges-${sp.id}" class="d-flex flex-wrap gap-1"><span class="text-muted small" style="font-size:.72rem;">Cargando…</span></div>
        </div>
        <button class="btn btn-sm btn-outline-dark flex-shrink-0" data-edit-sp="${sp.id}"><i class="bi bi-pencil"></i></button>
      </div>`).join("");
    document.querySelectorAll("[data-edit-sp]").forEach((el) => (el.onclick = () => openEditSpecialist(el.dataset.editSp)));

    for (const sp of specialistsCache) {
      const ids = await api(`/staff/specialists/${sp.id}/services`).catch(() => []);
      const names = ids.map((id) => servicesCache.find((s) => s.id === id)?.name).filter(Boolean);
      const box = document.getElementById(`svcBadges-${sp.id}`);
      if (box) box.innerHTML = names.length
        ? names.map((n) => `<span class="badge rounded-pill" style="background:rgba(15,82,87,.1);color:var(--primary);font-size:.68rem;">${n}</span>`).join("")
        : `<span class="text-muted small" style="font-size:.72rem;">Sin servicios asignados</span>`;
    }
  }

  function specialistServiceCheckboxes(selectedIds) {
    return servicesCache.map((s) => `<div class="form-check"><input class="form-check-input" type="checkbox" value="${s.id}" id="spSvc_${s.id}" ${selectedIds.includes(s.id) ? "checked" : ""}>
      <label class="form-check-label small" for="spSvc_${s.id}">${s.name}</label></div>`).join("");
  }

  async function openEditSpecialist(id) {
    const sp = specialistsCache.find((sp) => sp.id === id);
    if (!sp) return;
    editingSpecialistId = id;
    document.getElementById("editSpecialistModalTitle").textContent = "Editar especialista";
    document.getElementById("editSpecialistDeleteBtn").style.display = "inline-block";
    document.getElementById("editSpecialistName").value = sp.name;
    document.getElementById("editSpecialistRole").value = sp.role || "";
    document.getElementById("editSpecialistAvatar").value = sp.avatar;
    document.getElementById("editSpecialistColor").value = sp.color;
    const selected = await api(`/staff/specialists/${id}/services`).catch(() => []);
    document.getElementById("editSpecialistServices").innerHTML = specialistServiceCheckboxes(selected);
    editSpecialistModal = editSpecialistModal || new bootstrap.Modal(document.getElementById("editSpecialistModal"));
    editSpecialistModal.show();
  }

  document.getElementById("addSpecialistOpenBtn").onclick = () => {
    editingSpecialistId = null;
    document.getElementById("editSpecialistModalTitle").textContent = "Añadir especialista";
    document.getElementById("editSpecialistDeleteBtn").style.display = "none";
    document.getElementById("editSpecialistName").value = "";
    document.getElementById("editSpecialistRole").value = "";
    document.getElementById("editSpecialistAvatar").value = "";
    document.getElementById("editSpecialistColor").value = "#0f5257";
    document.getElementById("editSpecialistServices").innerHTML = specialistServiceCheckboxes([]);
    editSpecialistModal = editSpecialistModal || new bootstrap.Modal(document.getElementById("editSpecialistModal"));
    editSpecialistModal.show();
  };

  document.getElementById("editSpecialistSaveBtn").onclick = async () => {
    const name = document.getElementById("editSpecialistName").value.trim();
    if (!name) return toast("Ponle un nombre.", false);
    const role = document.getElementById("editSpecialistRole").value.trim();
    const avatar = (document.getElementById("editSpecialistAvatar").value.trim() || name.slice(0, 2)).slice(0, 2).toUpperCase();
    const color = document.getElementById("editSpecialistColor").value;
    const serviceIds = Array.from(document.querySelectorAll("#editSpecialistServices input:checked")).map((el) => el.value);

    let id = editingSpecialistId;
    if (id === null) {
      const created = await api("/staff/specialists", { method: "POST", body: { name, role, avatar, color } });
      id = created.id;
    } else {
      await api(`/staff/specialists/${id}`, { method: "PATCH", body: { name, role, avatar, color } });
    }
    await api(`/staff/specialists/${id}/services`, { method: "PUT", body: { serviceIds } });
    editSpecialistModal.hide();
    toast("Especialista guardado.");
    renderSpecialists();
  };
  document.getElementById("editSpecialistDeleteBtn").onclick = async () => {
    if (!confirm("¿Eliminar a este especialista? No se puede deshacer.")) return;
    await api(`/staff/specialists/${editingSpecialistId}`, { method: "DELETE" });
    editSpecialistModal.hide();
    toast("Especialista eliminado.");
    renderSpecialists();
  };

  return { render };
})();
