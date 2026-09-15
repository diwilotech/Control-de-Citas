// Cliente de API compartido por index.html (reserva pública), admin.html y setup.html. Todo va
// envuelto en un IIFE para no dejar `api`/`toast`/`tenantSlug` como identificadores globales: las
// páginas que consumen esto hacen `const { api, toast } = window.CDC`, y si esos mismos nombres
// quedaran declarados sueltos acá, el navegador tira "Identifier ya declarado" y el script entero
// de esa página deja de correr (así fallaban login y datos, en silencio, en todas las páginas).
(function () {
  // El negocio vive en /:slug (reserva) o /:slug/admin (panel) — siempre el primer segmento.
  function tenantSlug() {
    const parts = location.pathname.split("/").filter(Boolean);
    return parts[0] || new URLSearchParams(location.search).get("t");
  }

  async function request(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  async function api(path, opts = {}) {
    const slug = tenantSlug();
    if (!slug) throw new Error("Falta el negocio en la URL (usa /tu-negocio).");
    return request(`/api/${slug}${path}`, opts);
  }

  // Endpoints que no son de un negocio (el super admin de la plataforma: /api/admin/...).
  async function apiRoot(path, opts = {}) {
    return request(`/api${path}`, opts);
  }

  function toast(msg, ok = true) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.style.cssText = "position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:2000;padding:.6rem 1.1rem;border-radius:12px;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.18);display:none;max-width:90%;text-align:center;color:#fff;";
      document.body.appendChild(el);
    }
    el.style.background = ok ? "#0a3a3d" : "#c0472f";
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.display = "none"), 3200);
  }

  window.CDC = { api, apiRoot, tenantSlug, toast };
})();
