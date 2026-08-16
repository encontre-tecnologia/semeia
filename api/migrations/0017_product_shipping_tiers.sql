-- Frete por faixa de distância. JSON: [{"upToKm":5,"feeCents":500},{"upToKm":null,"feeCents":null}]
-- upToKm null = faixa final ("acima da anterior"); feeCents null = "a combinar".
-- shipping_fee_cents continua guardando o menor valor das faixas, para as telas que mostram "a partir de".
ALTER TABLE products ADD COLUMN shipping_tiers TEXT;
