-- Código de país para completar números locales (ej. celular colombiano de 10 dígitos) antes de
-- mandarlos a Evolution API, que espera el número en formato internacional completo.
ALTER TABLE businesses ADD COLUMN whatsapp_country_code TEXT NOT NULL DEFAULT '57';
