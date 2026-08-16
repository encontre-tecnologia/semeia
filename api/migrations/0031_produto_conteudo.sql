-- Conteúdo do produto: quanto vem em cada venda.
--
-- O comprador via o preço e a unidade ("R$ 18,00 /un"), mas não tinha como
-- saber se a garrafa de suco é de 300 ml ou de 1 litro, nem se o queijo é de
-- 250 g ou meio quilo. Sem isso não dá para comparar preço entre duas lojas.
--
-- Existia só `weight_kg`, que alimenta a estimativa de CO₂ e é preenchido
-- automaticamente quando o vendedor não informa — mostrar aquele número ao
-- comprador seria apresentar um chute do sistema como se fosse informação da
-- loja. Por isso as colunas são novas e ficam vazias até alguém preencher.
--
-- `content_unit` guarda a medida (g, kg, ml, l, un); `content_amount` o número.
ALTER TABLE products ADD COLUMN content_amount REAL;
ALTER TABLE products ADD COLUMN content_unit TEXT;
