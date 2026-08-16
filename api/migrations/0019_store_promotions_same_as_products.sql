-- Destaque de loja passa a usar exatamente o mesmo modelo do destaque de produto:
-- posições de 1 a 5 e o mesmo escopo (catálogo geral, categoria, ou os dois).
-- A tabela de 0018 nunca recebeu registros, então é recriada em vez de alterada
-- (o SQLite não permite mexer em CHECK de coluna existente).
DROP TABLE IF EXISTS store_promotions;

CREATE TABLE store_promotions (
  id                    TEXT PRIMARY KEY,
  store_id              TEXT NOT NULL REFERENCES stores(id),
  requested_position    INTEGER NOT NULL CHECK (requested_position BETWEEN 1 AND 5),
  duration_days         INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30)),
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
  placement_scope       TEXT NOT NULL DEFAULT 'home'
                          CHECK (placement_scope IN ('home', 'category', 'both')),
  placement_category    TEXT,
  currency              TEXT NOT NULL DEFAULT 'BRL',
  status                TEXT NOT NULL DEFAULT 'paid_pending_review'
                          CHECK (status IN ('payment_pending','paid_pending_review','approved','rejected','payment_failed')),
  paid_at               INTEGER,
  reviewed_at           INTEGER,
  starts_at             INTEGER,
  ends_at               INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX idx_store_promotions_store ON store_promotions(store_id, created_at DESC);
CREATE INDEX idx_store_promotions_review ON store_promotions(status, created_at DESC);
CREATE INDEX idx_store_promotions_active ON store_promotions(status, requested_position, ends_at);
