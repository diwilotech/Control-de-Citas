-- URL de Evolution API por negocio: antes solo se podía poner como secreto de Cloudflare
-- (wrangler secret put), lo que confundía a quien solo tiene acceso al panel de Ajustes.
ALTER TABLE businesses ADD COLUMN evolution_url TEXT;
