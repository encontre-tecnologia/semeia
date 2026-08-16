-- Semeia — estrutura inicial do Cloudflare D1.

CREATE TABLE stores (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  contact_name         TEXT NOT NULL,
  email                TEXT NOT NULL,
  whatsapp             TEXT,
  payment_link         TEXT,
  category             TEXT NOT NULL,
  region               TEXT NOT NULL,
  seals                TEXT NOT NULL DEFAULT '[]',
  plan                 TEXT NOT NULL DEFAULT 'semente'
                         CHECK (plan IN ('semente', 'raiz')),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'suspended')),
  mp_user_id           TEXT,
  mp_access_token      TEXT,
  mp_refresh_token     TEXT,
  mp_token_expires_at  INTEGER,
  created_at           INTEGER NOT NULL
);

CREATE INDEX idx_stores_status ON stores(status);
CREATE UNIQUE INDEX idx_stores_mp_user ON stores(mp_user_id) WHERE mp_user_id IS NOT NULL;

CREATE TABLE products (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  unit         TEXT NOT NULL DEFAULT '/un',
  category     TEXT NOT NULL,
  seals        TEXT NOT NULL DEFAULT '[]',
  co2_g        INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_products_store ON products(store_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(active);

CREATE TABLE orders (
  id                TEXT PRIMARY KEY,
  product_id        TEXT NOT NULL REFERENCES products(id),
  store_id          TEXT NOT NULL REFERENCES stores(id),
  buyer_email       TEXT,
  amount_cents      INTEGER NOT NULL CHECK (amount_cents >= 0),
  fee_cents         INTEGER NOT NULL CHECK (fee_cents >= 0),
  co2_g             INTEGER NOT NULL DEFAULT 0,
  mp_preference_id  TEXT,
  mp_payment_id     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_orders_store ON orders(store_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE UNIQUE INDEX idx_orders_payment ON orders(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
