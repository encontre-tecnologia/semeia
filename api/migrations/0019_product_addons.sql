-- Adicionais opcionais configurados pelo vendedor (ex.: cobertura, embalagem).
-- JSON validado pela API; [] mantém compatibilidade com anúncios antigos.
ALTER TABLE products ADD COLUMN addons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE direct_purchase_confirmations ADD COLUMN selected_addons TEXT NOT NULL DEFAULT '[]';
