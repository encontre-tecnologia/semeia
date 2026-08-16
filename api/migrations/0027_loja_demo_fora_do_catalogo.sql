-- Tira a loja de demonstração do catálogo do piloto.
--
-- "Coop. Vale Verde" veio do seed.demo.sql (e-mail contato@valeverde.exemplo) e
-- estava aprovada, aparecendo na vitrine junto com produtores de verdade — com
-- "Zona Sul", um bairro, no lugar da cidade.
--
-- Suspender em vez de apagar: some da vitrine, o histórico fica. Para trazer de
-- volta: UPDATE stores SET status = 'approved' WHERE id = 'st-vale-verde';
UPDATE stores
   SET status = 'suspended',
       region = 'São Carlos - SP'
 WHERE id = 'st-vale-verde' AND email = 'contato@valeverde.exemplo';
