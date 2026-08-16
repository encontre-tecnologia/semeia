-- Vitrine da loja: Instagram e imagem de capa.
--
-- Eram os dois únicos itens da página pública que não tinham onde morar: o
-- resto (nome, logo, descrição, cidade, horário, WhatsApp, produtos, retirada
-- e entrega) já sai de dados existentes.
--
-- Ambos opcionais: loja sem capa continua caindo na ilustração por categoria.
ALTER TABLE stores ADD COLUMN instagram TEXT;
ALTER TABLE stores ADD COLUMN cover_url TEXT;
