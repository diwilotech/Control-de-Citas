// Si app.js no cargó (red, extensión del navegador, caché vieja), CDC.api/toast quedan undefined
// y cada botón fallaría en silencio. toast tiene su propia implementación de respaldo acá mismo
// para que el error SIEMPRE se vea, nunca se quede sin ningún aviso.
const CDC = window.CDC || {};
const api = CDC.api;
const tenantSlug = CDC.tenantSlug;
const toast = CDC.toast || function (msg, ok = true) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:2000;padding:.6rem 1.1rem;border-radius:12px;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:90%;text-align:center;color:#fff;background:${ok ? "#0a3a3d" : "#c0472f"};`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
};
if (typeof api !== "function") {
  toast("No cargó app.js. Recarga con Ctrl+Shift+R o revisa la consola del navegador (F12).", false);
}

let servicesCache = [];
let specialistsCache = [];

async function boot(){
  try {
    const me = await api("/staff/me");
    showApp(me);
  } catch {
    document.getElementById("loginView").style.display = "block";
  }
}

document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pin = document.getElementById("loginPin").value.trim();
  if (!email || !pin) return toast("Escribe tu correo y tu PIN.", false);
  try {
    const { user } = await api("/auth/login", { method: "POST", body: { email, pin } });
    showApp(user);
  } catch (e) { toast(e.message, false); }
};

document.getElementById("logoutBtn").onclick = async () => {
  await api("/auth/logout", { method: "POST" });
  location.reload();
};

function showApp(user){
  document.getElementById("loginView").style.display = "none";
  document.getElementById("appView").style.display = "block";
  document.getElementById("logoutBtn").style.display = "inline-block";
  document.getElementById("bizName").textContent = user.name ? `Panel de ${user.name}` : "Panel";
  document.getElementById("agendaDate").value = new Date().toISOString().slice(0,10);
  document.querySelectorAll("#tabs button").forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
  loadAgenda();
  loadServices();
  loadSpecialists();
  loadSpaces();
  loadSettings();
}

function switchTab(tab){
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  ["agenda","services","specialists","spaces","settings"].forEach(t =>
    document.getElementById(`tab-${t}`).style.display = t === tab ? "block" : "none");
}

/* ---------- Agenda ---------- */
document.getElementById("agendaDate").onchange = loadAgenda;

async function loadAgenda(){
  const date = document.getElementById("agendaDate").value;
  const list = await api(`/staff/appointments?date=${date}`).catch((e) => { toast(e.message, false); return []; });
  const wrap = document.getElementById("agendaList");
  wrap.innerHTML = list.length ? "" : `<p class="text-muted">Sin citas este día.</p>`;
  list.forEach(a => wrap.appendChild(apptCard(a)));
}

function apptCard(a){
  const div = document.createElement("div");
  div.className = `appt-row st-${a.status}`;
  const labels = { confirmed:"Confirmada", completed:"Completada", cancelled:"Cancelada", "no-show":"Inasistencia", reagendar:"Por reagendar" };
  div.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div>
        <div class="fw-semibold">${a.start} - ${a.end} · ${a.service_name}</div>
        <div class="text-muted small"><i class="bi bi-person"></i> ${a.client_name} · <span class="mini" style="color:${a.specialist_color}">${a.specialist_name}</span></div>
        <span class="badge rounded-pill bg-light text-dark border mt-1">${labels[a.status] || a.status}</span>
        ${a.pending_move_date ? `<span class="badge rounded-pill" style="background:#fff3d6;color:#8a6d1f;">Propuesta pendiente: ${a.pending_move_date} ${a.pending_move_start}</span>` : ""}
      </div>
      <div class="d-flex flex-wrap gap-1" id="actions-${a.id}"></div>
    </div>`;
  renderActions(div.querySelector(`#actions-${a.id}`), a);
  return div;
}

function actionBtn(label, cls, onClick){
  const b = document.createElement("button");
  b.className = `btn btn-sm ${cls}`;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function renderActions(el, a){
  el.innerHTML = "";
  if (a.pending_move_date){
    el.appendChild(actionBtn("Aceptó", "btn-outline-success", () => run(`/staff/appointments/${a.id}/accept-move`)));
    el.appendChild(actionBtn("Rechazó", "btn-outline-danger", () => run(`/staff/appointments/${a.id}/reject-move`)));
    return;
  }
  if (a.status === "confirmed" || a.status === "reagendar"){
    el.appendChild(actionBtn("Cancelar", "btn-outline-danger", () => askAndRun(a, "cancel")));
    el.appendChild(actionBtn("Reagendar", "btn-outline-warning", () => askAndRun(a, "reschedule")));
    el.appendChild(actionBtn("Mover", "btn-outline-primary", () => promptMove(a)));
    el.appendChild(actionBtn("Completada", "btn-outline-success", () => run(`/staff/appointments/${a.id}/complete`)));
  } else if (a.status === "cancelled"){
    el.appendChild(actionBtn("Reabrir", "btn-outline-primary", () => askAndRun(a, "reopen")));
  }
}

async function run(path, body){
  try { await api(path, { method: "POST", body: body || {} }); await loadAgenda(); }
  catch (e) { toast(e.message, false); }
}

async function askAndRun(a, action){
  const sendMessage = confirm(`¿Enviar un mensaje a ${a.client_name} avisándole?\nAceptar = sí enviar, Cancelar = solo aplicar el cambio.`);
  await run(`/staff/appointments/${a.id}/${action}`, { sendMessage });
}

function promptMove(a){
  const date = prompt("Nueva fecha (YYYY-MM-DD):", a.date);
  if (!date) return;
  const start = prompt("Nueva hora (HH:MM):", a.start);
  if (!start) return;
  const sendMessage = confirm("¿Enviar mensaje avisando la propuesta?");
  run(`/staff/appointments/${a.id}/move`, { date, start, sendMessage });
}

document.getElementById("newApptBtn").onclick = async () => {
  const clientName = prompt("Nombre del cliente:");
  if (!clientName) return;
  const clientPhone = prompt("Celular (opcional):") || "";
  if (!servicesCache.length) return toast("Crea un servicio primero.", false);
  const serviceId = servicesCache[0].id;
  if (!specialistsCache.length) return toast("Crea un especialista primero.", false);
  const specialistId = specialistsCache[0].id;
  const start = prompt("Hora (HH:MM):", "10:00");
  if (!start) return;
  try {
    await api("/staff/appointments", { method: "POST", body: {
      clientName, clientPhone, serviceId, specialistId, date: document.getElementById("agendaDate").value, start } });
    toast("Cita creada.");
    loadAgenda();
  } catch (e) { toast(e.message, false); }
};

/* ---------- Servicios ---------- */
async function loadServices(){
  servicesCache = await api("/staff/services").catch(() => []);
  document.getElementById("servicesList").innerHTML = servicesCache.map(s => `
    <div class="appt-row d-flex justify-content-between align-items-center">
      <div><strong>${s.name}</strong> <span class="text-muted small">· ${s.duration_min} min · $${s.price}</span></div>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('services','${s.id}', loadServices)">Eliminar</button>
    </div>`).join("");
}
document.getElementById("addServiceBtn").onclick = async () => {
  const name = document.getElementById("svcName").value.trim();
  if (!name) return toast("Falta el nombre.", false);
  await api("/staff/services", { method: "POST", body: {
    name,
    duration_min: Number(document.getElementById("svcDuration").value) || 30,
    price: Number(document.getElementById("svcPrice").value) || 0,
    cancel_window_hours: Number(document.getElementById("svcCancel").value) || 4,
    reminder_hours: Number(document.getElementById("svcReminder").value) || 12,
  }});
  document.getElementById("svcName").value = "";
  loadServices();
};

/* ---------- Especialistas ---------- */
async function loadSpecialists(){
  specialistsCache = await api("/staff/specialists").catch(() => []);
  document.getElementById("specialistsList").innerHTML = specialistsCache.map(sp => `
    <div class="appt-row d-flex justify-content-between align-items-center">
      <div class="d-flex align-items-center gap-2">
        <span class="avatar-badge" style="background:${sp.color}">${sp.avatar}</span>
        <div><strong>${sp.name}</strong><div class="text-muted small">${sp.role || ""}</div></div>
      </div>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('specialists','${sp.id}', loadSpecialists)">Eliminar</button>
    </div>`).join("");
}
document.getElementById("addSpecialistBtn").onclick = async () => {
  const name = document.getElementById("spName").value.trim();
  if (!name) return toast("Falta el nombre.", false);
  await api("/staff/specialists", { method: "POST", body: {
    name, role: document.getElementById("spRole").value.trim(),
    avatar: (document.getElementById("spAvatar").value.trim() || name.slice(0,2)).toUpperCase(),
    color: document.getElementById("spColor").value,
  }});
  document.getElementById("spName").value = "";
  loadSpecialists();
};

/* ---------- Espacios ---------- */
async function loadSpaces(){
  const spaces = await api("/staff/spaces").catch(() => []);
  document.getElementById("spacesList").innerHTML = spaces.map(s => `
    <div class="appt-row d-flex justify-content-between align-items-center">
      <div><strong>${s.label}</strong> <span class="text-muted small">· ${s.type} · ${s.capacity} pers.</span></div>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteResource('spaces','${s.id}', loadSpaces)">Eliminar</button>
    </div>`).join("");
}
document.getElementById("addSpaceBtn").onclick = async () => {
  const label = document.getElementById("spcLabel").value.trim();
  if (!label) return toast("Falta el nombre.", false);
  await api("/staff/spaces", { method: "POST", body: {
    label, type: document.getElementById("spcType").value, shape: document.getElementById("spcShape").value,
    capacity: Number(document.getElementById("spcCapacity").value) || 2, x: 0, y: 0, w: 3, h: 3,
  }});
  document.getElementById("spcLabel").value = "";
  loadSpaces();
};

/* ---------- Ajustes ---------- */
async function loadSettings(){
  const biz = await api("/staff/settings").catch(() => null);
  if (biz){
    document.getElementById("setOpenHour").value = biz.open_hour;
    document.getElementById("setCloseHour").value = biz.close_hour;
    document.getElementById("setWhatsappEnabled").checked = !!biz.whatsapp_enabled;
    document.getElementById("setEvoInstance").value = biz.evolution_instance || "";
    document.getElementById("setEvoApiKey").value = biz.evolution_api_key || "";
    document.getElementById("setWebhookUrl").value = `${location.origin}/api/${tenantSlug()}/webhook/evolution/${biz.webhook_token}`;
  }
  const templates = await api("/staff/templates").catch(() => ({}));
  const labels = { booked:"Cita agendada", cancel:"Cancelación", reschedule:"Pedir reagendar", move:"Mover cita", reopen:"Reabrir cita" };
  document.getElementById("templatesForm").innerHTML = Object.entries(templates).map(([key, body]) => `
    <label class="label-xs d-block mb-1">${labels[key] || key}</label>
    <textarea class="form-control mb-3" rows="2" data-key="${key}">${body}</textarea>`).join("") +
    `<button class="btn btn-brand btn-sm" id="saveTemplatesBtn">Guardar plantillas</button>`;
  document.getElementById("saveTemplatesBtn").onclick = async () => {
    for (const ta of document.querySelectorAll("#templatesForm textarea")) {
      await api("/staff/templates", { method: "PATCH", body: { key: ta.dataset.key, body: ta.value } });
    }
    toast("Plantillas guardadas.");
  };
}
document.getElementById("saveSettingsBtn").onclick = async () => {
  await api("/staff/settings", { method: "PATCH", body: {
    openHour: Number(document.getElementById("setOpenHour").value),
    closeHour: Number(document.getElementById("setCloseHour").value),
  }});
  toast("Horario guardado.");
};

document.getElementById("saveWhatsappBtn").onclick = async () => {
  await api("/staff/settings", { method: "PATCH", body: {
    whatsappEnabled: document.getElementById("setWhatsappEnabled").checked,
    evolutionInstance: document.getElementById("setEvoInstance").value.trim(),
    evolutionApiKey: document.getElementById("setEvoApiKey").value.trim(),
  }});
  toast("WhatsApp guardado.");
};

document.getElementById("copyWebhookBtn").onclick = async () => {
  await navigator.clipboard.writeText(document.getElementById("setWebhookUrl").value);
  toast("Link copiado.");
};

document.getElementById("rotateWebhookBtn").onclick = async () => {
  if (!confirm("El link anterior dejará de funcionar. ¿Generar uno nuevo?")) return;
  const { webhookToken } = await api("/staff/webhook/rotate", { method: "POST" });
  document.getElementById("setWebhookUrl").value = `${location.origin}/api/${tenantSlug()}/webhook/evolution/${webhookToken}`;
  toast("Link nuevo generado. Actualízalo en Evolution API.");
};

async function deleteResource(path, id, reload){
  if (!confirm("¿Eliminar?")) return;
  await api(`/staff/${path}/${id}`, { method: "DELETE" });
  reload();
}

boot();
