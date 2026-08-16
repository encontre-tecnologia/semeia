-- Contador simples de visualizações por produto, usado nas métricas do painel da loja.
CREATE TABLE product_views (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  views      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
