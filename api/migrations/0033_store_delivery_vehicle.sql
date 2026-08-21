-- Veículo padrão da loja para entregas feitas pelo vendedor.
ALTER TABLE stores ADD COLUMN delivery_vehicle TEXT NOT NULL DEFAULT 'gasoline_car';

