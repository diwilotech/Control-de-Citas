-- Log temporal del body crudo que manda Evolution API al webhook, para depurar el formato real
-- (varía entre versiones/config de Evolution) sin tener que adivinar. Se puede borrar más
-- adelante una vez el parseo esté confirmado contra el formato real.
CREATE TABLE webhook_log (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
