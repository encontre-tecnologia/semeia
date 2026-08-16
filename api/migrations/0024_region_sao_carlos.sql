-- Cidade em formato único.
--
-- O campo era texto livre: "SAO CARLOS", "SÃO CARLOS" e "São Carlos" viraram
-- três cidades diferentes na busca e no filtro. Agora tudo entra como
-- "São Carlos - SP" (ver normalizeRegion em src/parsing.ts).
--
-- Bairro não é cidade: "Zona Sul" fica como está para o time decidir, em vez
-- de a migração inventar um endereço que ninguém informou.
UPDATE stores
   SET region = 'São Carlos - SP'
 WHERE UPPER(TRIM(region)) IN ('SAO CARLOS', 'SÃO CARLOS', 'SAO CARLOS - SP', 'SÃO CARLOS - SP', 'SAOCARLOS', 'SÃOCARLOS');
