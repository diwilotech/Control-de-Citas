-- Horario semanal propio de un especialista (además de work_days, que ya existía pero no se
-- usaba en ningún lado). NULL = hereda el horario general del negocio.
ALTER TABLE specialists ADD COLUMN open_hour INTEGER;
ALTER TABLE specialists ADD COLUMN close_hour INTEGER;
