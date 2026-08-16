-- Slug público da loja, usado na URL amigável /loja/<slug>.
ALTER TABLE stores ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_slug ON stores (slug) WHERE slug IS NOT NULL;
