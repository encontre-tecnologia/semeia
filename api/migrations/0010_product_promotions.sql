CREATE TABLE product_promotions (
  id                    TEXT PRIMARY KEY,
  product_id            TEXT NOT NULL REFERENCES products(id),
  store_id              TEXT NOT NULL REFERENCES stores(id),
  requested_position    INTEGER NOT NULL CHECK (requested_position BETWEEN 1 AND 5),
  duration_days         INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30)),
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
  currency              TEXT NOT NULL DEFAULT 'BRL',
  status                TEXT NOT NULL DEFAULT 'payment_pending'
                          CHECK (status IN ('payment_pending','paid_pending_review','approved','rejected','payment_failed')),
  mp_preference_id      TEXT UNIQUE,
  mp_payment_id         TEXT UNIQUE,
  mp_payment_status     TEXT,
  paid_at               INTEGER,
  reviewed_at           INTEGER,
  starts_at             INTEGER,
  ends_at               INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX idx_promotions_store ON product_promotions(store_id, created_at DESC);
CREATE INDEX idx_promotions_review ON product_promotions(status, paid_at DESC);
CREATE INDEX idx_promotions_active_position ON product_promotions(status, requested_position, ends_at);
