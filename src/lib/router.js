// Router mínimo sin dependencias: evita repetir el parseo de rutas/params en cada endpoint.
export class Router {
  constructor() {
    this.routes = [];
  }
  add(method, pattern, handler) {
    const segments = pattern.split("/").filter(Boolean);
    this.routes.push({ method, segments, handler });
    return this;
  }
  get(p, h) { return this.add("GET", p, h); }
  post(p, h) { return this.add("POST", p, h); }
  patch(p, h) { return this.add("PATCH", p, h); }
  delete(p, h) { return this.add("DELETE", p, h); }

  match(method, pathname) {
    const parts = pathname.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) { ok = false; break; }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}
