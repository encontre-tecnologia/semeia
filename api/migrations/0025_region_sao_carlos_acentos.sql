-- Complemento da 0024.
--
-- UPPER() do SQLite só sobe letra ASCII: "São Carlos" virava "SãO CARLOS" e
-- escapava da comparação. Aqui as grafias com acento entram na mão.
UPDATE stores
   SET region = 'São Carlos - SP'
 WHERE TRIM(region) IN ('São Carlos', 'são carlos', 'Sao Carlos', 'sao carlos', 'São Carlos-SP', 'São carlos');
