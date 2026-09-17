-- Foto de un servicio, guardada en R2 (bucket FILES). Se guarda solo el nombre del archivo (no la
-- URL completa) — el key real en R2 es {business_id}/{photo_key}, para que un negocio nunca pueda
-- ver/reemplazar el archivo de otro aunque adivine el nombre.
ALTER TABLE services ADD COLUMN photo_key TEXT;
