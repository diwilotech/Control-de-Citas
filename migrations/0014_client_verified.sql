-- Marca si un cliente ya confirmó al menos una cita por WhatsApp/correo alguna vez — a partir de
-- ahí, sus próximas reservas quedan confirmadas de una, sin pedirle el PIN otra vez.
ALTER TABLE clients ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
