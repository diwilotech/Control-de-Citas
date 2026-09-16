-- Tipos de espacio, antes fijos en el código (General/Barra/Privado/Terraza) — ahora editables
-- por negocio. `key` es lo que se guarda en spaces.type y en services.allowed_space_types.
CREATE TABLE space_types (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(business_id, key)
);
CREATE INDEX idx_space_types_business ON space_types(business_id);
