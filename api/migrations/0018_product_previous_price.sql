-- Preserva o valor imediatamente anterior somente quando o vendedor reduz o preço.
-- A API usa este campo para apresentar a redução real, sem promoções inventadas.
ALTER TABLE products ADD COLUMN previous_price_cents INTEGER;

