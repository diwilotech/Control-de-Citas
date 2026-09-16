# Control de Citas

Sistema de reservas multi-negocio (multi-tenant), desplegado en Cloudflare Workers + D1.
Sin frameworks ni bundler: JavaScript plano en módulos ES, para que sea fácil de leer y editar.

## Arquitectura

- **1 solo Worker** sirve la API (`/api/...`) y los archivos estáticos (`/public`) — sin
  necesitar un proyecto Pages aparte.
- **1 base D1 compartida**, multi-tenant por fila: toda tabla tiene `business_id`. Cada negocio
  (tenant) se identifica por un `slug` en la URL: `tuapp.workers.dev/mi-negocio` (reserva) y
  `tuapp.workers.dev/mi-negocio/admin` (panel de personal).
- **Evolution API** (WhatsApp) corre en **tu propio servidor**, no en Cloudflare — Workers no
  puede alojar procesos persistentes tipo Baileys. El Worker solo le hace peticiones HTTP
  (`src/lib/whatsapp.js`), para avisos de citas (agendada/cancelada/reagendar/mover/reabrir).
- **Login con correo + PIN**: tanto el super admin de la plataforma como el personal de cada
  negocio entran con su correo y un PIN de 4-8 dígitos (hasheado con salt, `src/lib/pin.js`), sin
  pasos intermedios ni proveedor de correo.
- **Super admin de la plataforma**: es quien puede crear negocios nuevos, ver todos los negocios
  (con sus servicios y especialistas) y administrar sus usuarios, incluyendo cambiar el tipo
  (dueño/personal) de cualquiera. Vive en `/admin` — la primera vez que se visita no existe
  todavía, así que la página pide registrarlo (correo + PIN); de ahí en adelante pide iniciar
  sesión con esa cuenta antes de mostrar el panel (`src/routes/platform.js`).
- **WhatsApp por negocio**: cada negocio puede prender/apagar el envío de avisos por WhatsApp y
  tiene su propio link de webhook para pegar en Evolution API (Ajustes → WhatsApp en el panel del
  negocio, `src/routes/webhook.js`).

## Estructura

```
src/
  index.js            Punto de entrada: rutas bonitas (/:slug, /:slug/admin, /admin) + despacho de la API
  lib/                 Código compartido: router, D1, auth, PIN, WhatsApp, plantillas, CRUD genérico
  routes/               Un archivo por grupo de endpoints (platform.js = super admin)
public/                Frontend (HTML+JS+CSS planos, sin build)
migrations/                Esquema (0001 inicial, 0002 login por PIN + super admin, 0003 WhatsApp on/off + webhook)
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
existen esas columnas) — desde el panel del negocio, Ajustes → WhatsApp. Ahí mismo se puede
apagar el envío de avisos por WhatsApp para ese negocio (`whatsapp_enabled`), y se muestra el
link de webhook (`/api/:slug/webhook/evolution/:token`) para pegarlo en Evolution API → esa
instancia → Webhook, así Evolution puede avisarle al Worker de eventos entrantes.

El payload que arma `src/lib/whatsapp.js` asume el contrato de Evolution API v2
(`POST /message/sendText/{instance}`, header `apikey`). Si tu versión usa otro formato, es el
único archivo que hay que tocar.

### Deploy automático

El repo está conectado a **Cloudflare Workers Builds**: cada push a `main` dispara un deploy
solo (Cloudflare clona el repo, instala dependencias y corre `wrangler deploy`). No hace falta
GitHub Actions ni secretos en GitHub — se administra desde el dashboard de Cloudflare, en
Workers & Pages → `cdcitas` → Settings → Build.

Ese deploy automático **no** aplica migraciones nuevas de D1 por sí solo. Si agregas una
migración (`migrations/0002_*.sql`), aplícala a mano antes o después del push:
```bash
npm run db:migrate:remote
```

## Crear el primer negocio

Visita `/admin`. La primera vez te pide registrar la cuenta de super admin (nombre, correo, PIN);
después de eso, esa misma pantalla pide iniciar sesión con esa cuenta y ahí sí llena el
formulario del negocio (nombre, slug, dueño y su PIN) — te da dos enlaces: la página de reservas
del cliente (`/tu-negocio`) y el panel de administración (`/tu-negocio/admin`).

## Qué falta / roadmap

Este es un MVP funcional de punta a punta (reservar, agendar, cancelar/reagendar/mover/reabrir,
avisar por WhatsApp), deliberadamente simple. Lo que quedó fuera para no complicar el v1:

- Editor visual de plano del local (arrastrar mesas) — hoy los espacios se crean con un formulario.
- Vista de agenda tipo línea de tiempo — hoy es una lista cronológica del día.
- Recuperar/reset de PIN olvidado (hoy no hay forma de resetearlo salvo a mano en D1) y Google OAuth.
- Panel de "no-show" automático (marcar inasistencia).
- Cobro/planes por negocio.
