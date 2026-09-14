-- Control de Citas — esquema multi-tenant (todas las tablas llevan business_id)
-- SQLite / Cloudflare D1

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  open_hour INTEGER NOT NULL DEFAULT 9,
  close_hour INTEGER NOT NULL DEFAULT 19,
  open_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]', -- JSON array, 0=Dom..6=Sáb
  evolution_instance TEXT,
  evolution_api_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT, -- el código de acceso se envía por WhatsApp a este número (ver README)
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- 'owner' | 'staff'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(business_id, email)
);

-- Código de acceso de un solo uso (login sin contraseña, por ahora se muestra en la respuesta
-- de la API en vez de enviarse por correo real — ver README/roadmap para conectar un proveedor).
CREATE TABLE login_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, -- token de sesión (también va en la cookie)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Excepciones de horario puntuales: del negocio completo (specialist_id NULL)
-- o de un especialista específico, para una fecha concreta.
CREATE TABLE date_exceptions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  specialist_id TEXT REFERENCES specialists(id) ON DELETE CASCADE,
  date TEXT NOT NULL, -- YYYY-MM-DD
  closed INTEGER NOT NULL DEFAULT 1,
  open_hour INTEGER,
  close_hour INTEGER
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  price INTEGER NOT NULL DEFAULT 0,
  cancel_window_hours INTEGER NOT NULL DEFAULT 4,
  reminder_hours INTEGER NOT NULL DEFAULT 12,
  allowed_space_types TEXT NOT NULL DEFAULT '[]' -- JSON array de tipos de espacio; vacío = admite cualquiera
);

CREATE TABLE specialists (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  avatar TEXT NOT NULL DEFAULT '??',
  color TEXT NOT NULL DEFAULT '#0f5257',
  work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]' -- JSON array
);

CREATE TABLE specialist_services (
  specialist_id TEXT NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (specialist_id, service_id)
);

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  shape TEXT NOT NULL DEFAULT 'square', -- square | rect-h | rect-v
  capacity INTEGER NOT NULL DEFAULT 2,
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 3,
  h INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'libre'
);

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  specialist_id TEXT NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  specialist_id TEXT NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | completed | cancelled | no-show | reagendar
  pending_move_date TEXT,
  pending_move_start TEXT,
  pending_move_end TEXT,
  confirmation_date TEXT,
  confirmation_time TEXT,
  walk_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE appointment_messages (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- sent | failed
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE message_templates (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key TEXT NOT NULL, -- cancel | reschedule | move | reopen | otp
  body TEXT NOT NULL,
  UNIQUE(business_id, key)
);

CREATE INDEX idx_users_business ON users(business_id);
CREATE INDEX idx_specialists_business ON specialists(business_id);
CREATE INDEX idx_services_business ON services(business_id);
CREATE INDEX idx_spaces_business ON spaces(business_id);
CREATE INDEX idx_clients_business ON clients(business_id);
CREATE INDEX idx_appt_business_date ON appointments(business_id, date);
CREATE INDEX idx_appt_specialist_date ON appointments(specialist_id, date);
CREATE INDEX idx_blocks_business_date ON blocks(business_id, date);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
