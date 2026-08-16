-- Destaque de loja: três posições na faixa "Lojas em destaque" da home.
-- Espelha product_promotions, mas o alvo é a loja inteira em vez de um produto.
CREATE TABLE store_promotions (
  id                    TEXT PRIMARY KEY,
  store_id              TEXT NOT NULL REFERENCES stores(id),
  requested_position    INTEGER NOT NULL CHECK (requested_position BETWEEN 1 AND 3),
  duration_days         INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30)),
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
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
