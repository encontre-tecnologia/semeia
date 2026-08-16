-- Métricas agregadas por dia e navegador. Não guardamos IP, nome ou e-mail de visitantes.
CREATE TABLE store_metric_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  -- Vazio representa uma visita à vitrine da loja; por isso não há chave estrangeira aqui.
  product_id   TEXT NOT NULL DEFAULT '',
  metric_type  TEXT NOT NULL CHECK(metric_type IN ('store_view', 'product_view', 'whatsapp_click')),
  client_id    TEXT NOT NULL,
  occurred_on  TEXT NOT NULL DEFAULT (date('now')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(store_id, product_id, metric_type, client_id, occurred_on)
);

CREATE INDEX idx_store_metric_events_month
  ON store_metric_events(store_id, occurred_on, metric_type);
