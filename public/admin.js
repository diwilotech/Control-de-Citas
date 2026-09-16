// Shell del panel: login, logout, pestañas (bottom-nav) y arranque de cada módulo
// (Agenda/MonthCalendar/FloorPlan/Rules/Flujo, cada uno en su propio admin-*.js).
//
// Todo el contenido va dentro de un IIFE asignado a una propiedad de window (nunca a un
// `const`/`function` de nivel superior): admin.html carga varios <script src> en la misma
// página, y todos comparten un único scope léxico superior — si dos de ellos declararan el
// mismo `const api` o `const toast` sueltos, el navegador tira "Identifier ya declarado" y el
// script entero de esa página deja de correr (así fallaban login y datos, en silencio, en toda
// la sesión anterior). Cada admin-*.js sigue este mismo patrón.
window.AdminShell = (function () {
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

  const VIEWS = ["agenda", "calendario", "espacio", "reglas", "flujo", "ajustes"];

  function goView(view) {
    VIEWS.forEach((v) => { document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"; });
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "agenda") window.Agenda.render();
    if (view === "calendario") window.MonthCalendar.render();
    if (view === "espacio") window.FloorPlan.render();
    if (view === "reglas") window.Rules.render();
    if (view === "flujo") window.Flujo.render();
    if (view === "ajustes") loadAjustes();
  }

  async function boot() {
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

  function showApp(user) {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("appView").style.display = "block";
    document.getElementById("logoutBtn").style.display = "inline-block";
    document.getElementById("bizName").textContent = user.name ? `Panel de ${user.name}` : "Panel";
    document.querySelectorAll(".nav-btn").forEach((btn) => (btn.onclick = () => goView(btn.dataset.view)));
    goView("agenda");
  }

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

  async function loadAjustes() {
    const biz = await api("/staff/settings").catch(() => null);
    if (!biz) return;
    document.getElementById("setWhatsappEnabled").checked = !!biz.whatsapp_enabled;
    document.getElementById("setEvoUrl").value = biz.evolution_url || "";
    document.getElementById("setEvoInstance").value = biz.evolution_instance || "";
    document.getElementById("setEvoApiKey").value = biz.evolution_api_key || "";
    document.getElementById("setWhatsappCountryCode").value = biz.whatsapp_country_code || "57";
    document.getElementById("testWhatsappPrefix").textContent = `+${biz.whatsapp_country_code || "57"}`;
    document.getElementById("setWebhookUrl").value = `${location.origin}/api/${tenantSlug()}/webhook/evolution/${biz.webhook_token}`;
  }

  document.getElementById("saveWhatsappBtn").onclick = async () => {
    const countryCode = document.getElementById("setWhatsappCountryCode").value.trim().replace(/\D/g, "") || "57";
    await api("/staff/settings", { method: "PATCH", body: {
      whatsappEnabled: document.getElementById("setWhatsappEnabled").checked,
      evolutionUrl: document.getElementById("setEvoUrl").value.trim(),
      evolutionInstance: document.getElementById("setEvoInstance").value.trim(),
      evolutionApiKey: document.getElementById("setEvoApiKey").value.trim(),
      whatsappCountryCode: countryCode,
    } });
    document.getElementById("setWhatsappCountryCode").value = countryCode;
    document.getElementById("testWhatsappPrefix").textContent = `+${countryCode}`;
    toast("WhatsApp guardado.");
  };

  document.getElementById("testWhatsappBtn").onclick = async () => {
    const phone = document.getElementById("testWhatsappPhone").value.trim();
    if (!phone) return toast("Escribe un número.", false);
    const btn = document.getElementById("testWhatsappBtn");
    btn.disabled = true;
    try {
      await api("/staff/whatsapp/test", { method: "POST", body: { phone } });
      toast("Mensaje de prueba enviado — revisa ese WhatsApp.");
    } catch (e) { toast(e.message, false); }
    btn.disabled = false;
  };

  boot();

  return { goView };
})();
