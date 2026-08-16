ALTER TABLE products ADD COLUMN deleted_at INTEGER;
CREATE INDEX idx_products_not_deleted ON products(deleted_at, store_id);
