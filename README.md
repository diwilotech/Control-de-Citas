# Control de Citas

Sistema de reservas multi-negocio (multi-tenant), desplegado en Cloudflare Workers + D1.
Sin frameworks ni bundler: JavaScript plano en módulos ES, para que sea fácil de leer y editar.

## Arquitectura

- **1 solo Worker** sirve la API (`/api/...`) y los archivos estáticos (`/public`) — sin
  necesitar un proyecto Pages aparte.
- **1 base D1 compartida**, multi-tenant por fila: toda tabla tiene `business_id`. Cada negocio
  (tenant) se identifica por un `slug` en la URL: `tuapp.workers.dev/t/mi-negocio`.
- **Evolution API** (WhatsApp) corre en **tu propio servidor**, no en Cloudflare — Workers no
  puede alojar procesos persistentes tipo Baileys. El Worker solo le hace peticiones HTTP
  (`src/lib/whatsapp.js`).
- **Sin contraseñas**: el personal entra con correo + un código de 6 dígitos que se envía por
  WhatsApp (vía Evolution API) al celular registrado del usuario. No hay proveedor de correo
  conectado todavía — es la opción que pediste mientras montas esa parte de la infraestructura.

## Estructura

```
src/
  index.js            Punto de entrada: rutas bonitas (/t/:slug) + despacho de la API
  lib/                 Código compartido: router, D1, auth, WhatsApp, plantillas, CRUD genérico
  routes/               Un archivo por grupo de endpoints
public/                Frontend (HTML+JS+CSS planos, sin build)
migrations/0001_init.sql   Esquema completo (14 tablas)
```

`src/lib/crud.js` + `src/lib/db.js#makeResource` generan las rutas CRUD de servicios,
especialistas, espacios, clientes y bloqueos desde una sola función — para no repetir el mismo
SELECT/INSERT/UPDATE/DELETE cinco veces.

## Desplegar

La base D1 (`control-de-citas-db`) ya está creada y con el esquema aplicado (14 tablas), y su
`database_id` ya está en `wrangler.toml`. Solo falta subir el código del Worker:

```bash
npm install
npx wrangler login
npm run deploy
```

Si en el futuro agregas una migración nueva (`migrations/0002_*.sql`), aplícala con:
```bash
npm run db:migrate:remote
```

### Conectar Evolution API (secretos, no van en el repo)

```bash
npx wrangler secret put EVOLUTION_API_URL          # https://tu-evolution-api.com
npx wrangler secret put EVOLUTION_API_KEY          # apikey global (si usas una sola instancia)
npx wrangler secret put EVOLUTION_DEFAULT_INSTANCE # nombre de instancia por defecto
```

Si cada negocio tendrá su propio número/instancia de WhatsApp, en vez de las variables globales
guarda `evolution_instance` y `evolution_api_key` directamente en la fila de `businesses` (ya
existen esas columnas) — desde `/staff/settings` (PATCH `evolutionInstance`/`evolutionApiKey`).

El payload que arma `src/lib/whatsapp.js` asume el contrato de Evolution API v2
(`POST /message/sendText/{instance}`, header `apikey`). Si tu versión usa otro formato, es el
único archivo que hay que tocar.

### Deploy automático

El repo está conectado a **Cloudflare Workers Builds**: cada push a `main` dispara un deploy
solo (Cloudflare clona el repo, instala dependencias y corre `wrangler deploy`). No hace falta
GitHub Actions ni secretos en GitHub — se administra desde el dashboard de Cloudflare, en
Workers & Pages → `control-de-citas` → Settings → Build.

Ese deploy automático **no** aplica migraciones nuevas de D1 por sí solo. Si agregas una
migración (`migrations/0002_*.sql`), aplícala a mano antes o después del push:
```bash
npm run db:migrate:remote
```

## Crear el primer negocio

Visita `/setup.html`, llena el formulario (nombre, slug, tu correo y celular) y te da dos
enlaces: la página de reservas del cliente y el panel de administración.

## Qué falta / roadmap

Este es un MVP funcional de punta a punta (reservar, agendar, cancelar/reagendar/mover/reabrir,
avisar por WhatsApp), deliberadamente simple. Lo que quedó fuera para no complicar el v1:

- Editor visual de plano del local (arrastrar mesas) — hoy los espacios se crean con un formulario.
- Vista de agenda tipo línea de tiempo — hoy es una lista cronológica del día.
- Login por correo real (hoy es por WhatsApp) y Google OAuth.
- Panel de "no-show" automático (marcar inasistencia).
- Cobro/planes por negocio.
