-- Situação do pedido, marcada pelo vendedor. Uma linha por pedido (order_id),
-- enquanto direct_purchase_confirmations guarda uma linha por item.
-- stock_applied evita descontar o estoque duas vezes se o vendedor alternar os botões.
CREATE TABLE order_states (
  order_id      TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id),
  status        TEXT NOT NULL DEFAULT 'reported'
                  CHECK (status IN ('reported', 'paid', 'delivered', 'cancelled')),
  stock_applied INTEGER NOT NULL DEFAULT 0,
  paid_at       INTEGER,
  delivered_at  INTEGER,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_order_states_store ON order_states(store_id, updated_at DESC);
