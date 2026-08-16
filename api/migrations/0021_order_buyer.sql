-- Quem comprou e o que pediu. Sem isso, o vendedor recebia o Pix sem saber
-- para quem entregar: a confirmação existia só como métrica.
ALTER TABLE direct_purchase_confirmations ADD COLUMN order_id TEXT;
ALTER TABLE direct_purchase_confirmations ADD COLUMN buyer_name TEXT;
ALTER TABLE direct_purchase_confirmations ADD COLUMN buyer_whatsapp TEXT;
ALTER TABLE direct_purchase_confirmations ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_direct_confirmations_store ON direct_purchase_confirmations(store_id, created_at DESC);
