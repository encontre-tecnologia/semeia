-- Corrige o bloqueio do destaque gratuito do piloto.
--
-- As duas tabelas exigiam `amount_cents > 0`, de quando todo destaque era pago.
-- Com o modo cortesia (PROMOTION_FREE_DURING_PILOT), o valor gravado é 0 e a
-- solicitação do lojista morria no CHECK, sem chegar ao painel do admin.
--
-- Só o CHECK muda: passa a aceitar 0 (`>= 0`). Nenhuma coluna, índice ou linha
-- é alterada — as tabelas são recriadas com os mesmos dados porque o SQLite não
-- permite remover CHECK com ALTER TABLE.

PRAGMA foreign_keys = OFF;

CREATE TABLE product_promotions_novo (
  id                    TEXT PRIMARY KEY,
  product_id            TEXT NOT NULL REFERENCES products(id),
  store_id              TEXT NOT NULL REFERENCES stores(id),
  requested_position    INTEGER NOT NULL CHECK (requested_position BETWEEN 1 AND 5),
  duration_days         INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30)),
  amount_cents          INTEGER NOT NULL CHECK (amount_cents >= 0),
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
  updated_at            INTEGER NOT NULL,
  placement_scope       TEXT NOT NULL DEFAULT 'home'
                          CHECK (placement_scope IN ('home', 'both', 'category')),
  placement_category    TEXT
);

INSERT INTO product_promotions_novo
  (id, product_id, store_id, requested_position, duration_days, amount_cents, currency, status,
   mp_preference_id, mp_payment_id, mp_payment_status, paid_at, reviewed_at, starts_at, ends_at,
   created_at, updated_at, placement_scope, placement_category)
SELECT id, product_id, store_id, requested_position, duration_days, amount_cents, currency, status,
       mp_preference_id, mp_payment_id, mp_payment_status, paid_at, reviewed_at, starts_at, ends_at,
       created_at, updated_at, placement_scope, placement_category
  FROM product_promotions;

DROP TABLE product_promotions;
ALTER TABLE product_promotions_novo RENAME TO product_promotions;

CREATE TABLE store_promotions_novo (
  id                    TEXT PRIMARY KEY,
  store_id              TEXT NOT NULL REFERENCES stores(id),
  requested_position    INTEGER NOT NULL CHECK (requested_position BETWEEN 1 AND 5),
  duration_days         INTEGER NOT NULL CHECK (duration_days IN (7, 14, 30)),
  amount_cents          INTEGER NOT NULL CHECK (amount_cents >= 0),
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

INSERT INTO store_promotions_novo
  (id, store_id, requested_position, duration_days, amount_cents, placement_scope, placement_category,
   currency, status, paid_at, reviewed_at, starts_at, ends_at, created_at, updated_at)
SELECT id, store_id, requested_position, duration_days, amount_cents, placement_scope, placement_category,
       currency, status, paid_at, reviewed_at, starts_at, ends_at, created_at, updated_at
  FROM store_promotions;

DROP TABLE store_promotions;
ALTER TABLE store_promotions_novo RENAME TO store_promotions;

PRAGMA foreign_keys = ON;
