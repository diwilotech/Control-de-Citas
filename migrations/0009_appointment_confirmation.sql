-- Confirmación de cita por PIN (WhatsApp) o link (correo) + página pública de autogestión.
ALTER TABLE appointments ADD COLUMN confirm_channel TEXT; -- whatsapp | email
ALTER TABLE appointments ADD COLUMN confirm_pin TEXT;
ALTER TABLE appointments ADD COLUMN confirm_token TEXT;
ALTER TABLE appointments ADD COLUMN confirm_expires_at TEXT;

ALTER TABLE businesses ADD COLUMN confirm_window_hours INTEGER NOT NULL DEFAULT 3;
ALTER TABLE businesses ADD COLUMN gmail_user TEXT;
ALTER TABLE businesses ADD COLUMN gmail_app_password TEXT;

ALTER TABLE clients ADD COLUMN manage_token TEXT;
CREATE UNIQUE INDEX idx_clients_manage_token ON clients(manage_token);
