-- Encendido/apagado de WhatsApp por negocio y token de webhook para pegar en Evolution API.
ALTER TABLE businesses ADD COLUMN whatsapp_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN webhook_token TEXT;
UPDATE businesses SET webhook_token = lower(hex(randomblob(16))) WHERE webhook_token IS NULL;
