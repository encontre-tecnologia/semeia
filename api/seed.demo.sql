-- Dados fictícios do protótipo. Não representam uma loja ou conta real.
INSERT OR IGNORE INTO stores (
  id, name, contact_name, email, whatsapp, category, region, seals, plan, status, created_at
) VALUES (
  'st-vale-verde', 'Coop. Vale Verde', 'Ana Ribeiro', 'contato@valeverde.exemplo',
  '5511999990001', 'hortifruti', 'Zona Sul', '["organico","local"]',
  'semente', 'approved', unixepoch()
);

INSERT OR IGNORE INTO products (
  id, store_id, name, description, price_cents, unit, category, seals, co2_g, active, created_at
) VALUES (
  'cesta-vale-verde', 'st-vale-verde', 'Caixa da Roça',
  'Cesta semanal com verduras, legumes e frutas da estação.',
  4200, '/cesta', 'hortifruti', '["organico","local"]', 2400, 1, unixepoch()
);
