-- Exclusão de pedido pelo vendedor. Marca em vez de apagar, como já fazemos com
-- produtos: o registro fica para auditoria, mas sai das vendas e do impacto.
ALTER TABLE direct_purchase_confirmations ADD COLUMN deleted_at INTEGER;
