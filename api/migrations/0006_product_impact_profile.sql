-- Perfil usado pela estimativa comparativa de ciclo de vida do produto.
-- Os campos são declarados pelo vendedor e a API sempre expõe o resultado como estimativa.
ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'other_food';
ALTER TABLE products ADD COLUMN weight_kg REAL;
ALTER TABLE products ADD COLUMN processing TEXT NOT NULL DEFAULT 'fresh';
ALTER TABLE products ADD COLUMN packaging TEXT NOT NULL DEFAULT 'none';
ALTER TABLE products ADD COLUMN refrigerated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'pickup';
ALTER TABLE products ADD COLUMN pesticide_free INTEGER NOT NULL DEFAULT 0;
