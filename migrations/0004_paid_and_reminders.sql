-- Marca si una cita completada ya se cobró (para el dashboard de Flujo).
ALTER TABLE appointments ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
