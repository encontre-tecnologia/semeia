ALTER TABLE product_promotions ADD COLUMN placement_scope TEXT NOT NULL DEFAULT 'home'
  CHECK (placement_scope IN ('home', 'both', 'category'));
ALTER TABLE product_promotions ADD COLUMN placement_category TEXT;

CREATE INDEX idx_promotions_active_placement
  ON product_promotions(status, placement_scope, placement_category, requested_position, ends_at);
