CREATE TABLE direct_purchase_confirmations (
  id                   TEXT PRIMARY KEY,
  product_id           TEXT NOT NULL REFERENCES products(id),
  store_id             TEXT NOT NULL REFERENCES stores(id),
  fulfillment_method   TEXT NOT NULL
                         CHECK (fulfillment_method IN ('walk', 'bike', 'vehicle', 'delivery')),
  product_amount_cents INTEGER NOT NULL CHECK (product_amount_cents >= 0),
  shipping_fee_cents   INTEGER,
  co2_g                INTEGER NOT NULL DEFAULT 0 CHECK (co2_g >= 0),
  created_at           INTEGER NOT NULL
);

CREATE INDEX idx_direct_confirmations_created ON direct_purchase_confirmations(created_at);
CREATE INDEX idx_direct_confirmations_product ON direct_purchase_confirmations(product_id);
