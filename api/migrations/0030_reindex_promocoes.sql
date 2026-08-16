-- Recria os índices dos destaques.
--
-- A 0029 precisou recriar product_promotions e store_promotions para trocar o
-- CHECK de amount_cents. O DROP TABLE levou junto os índices declarados nas
-- migrações 0010, 0013 e 0019 — o esquema ficou sem eles, e as consultas de
-- agenda das posições e das listas do admin passaram a varrer a tabela inteira.
--
-- Mesmas definições originais, com IF NOT EXISTS para poder rodar em bancos
-- que ainda tenham os índices (ambiente local recriado do zero, por exemplo).
CREATE INDEX IF NOT EXISTS idx_promotions_store ON product_promotions(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotions_review ON product_promotions(status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotions_active_position ON product_promotions(status, requested_position, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_active_placement
  ON product_promotions(status, placement_scope, placement_category, requested_position, ends_at);

CREATE INDEX IF NOT EXISTS idx_store_promotions_store ON store_promotions(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_promotions_review ON store_promotions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_promotions_active ON store_promotions(status, requested_position, ends_at);
