-- Link para onde o comprador vai ao finalizar a compra, quando a loja não tem
-- Pix cadastrado. Sem ele, o comportamento de sempre continua: WhatsApp da loja.
ALTER TABLE stores ADD COLUMN checkout_redirect_url TEXT;
