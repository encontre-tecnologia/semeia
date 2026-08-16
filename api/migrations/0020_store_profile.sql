-- Descrição e horário de funcionamento da loja.
-- opening_hours é JSON com 7 posições (0 = domingo): null quando fecha no dia,
-- ou {"from":"08:00","to":"18:00"} quando abre.
ALTER TABLE stores ADD COLUMN description TEXT;
ALTER TABLE stores ADD COLUMN opening_hours TEXT;
