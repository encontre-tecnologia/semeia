-- Meio usado pelo vendedor para fazer a entrega.
-- Anúncios antigos assumem carro a gasolina, mas o vendedor pode corrigir ao editar.
ALTER TABLE products ADD COLUMN delivery_vehicle TEXT NOT NULL DEFAULT 'gasoline_car';
