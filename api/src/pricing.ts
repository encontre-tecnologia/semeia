/**
 * Semeia — tabela de preços dos destaques.
 *
 * Produto e loja usam exatamente os mesmos valores: muda só o que aparece na vitrine.
 */

export const PROMOTION_WEEKLY_PRICES = new Map([[1, 2990], [2, 2490], [3, 1990], [4, 1490], [5, 990]]);

export const PROMOTION_DURATION_MULTIPLIER = new Map([[7, 1], [14, 1.8], [30, 3.4]]);

export const PROMOTION_SCOPE_MULTIPLIER = new Map([["home", 1], ["category", 0.7], ["both", 1.45]]);

export const PRODUCT_CATEGORIES = new Set([
  "hortifruti", "sucos-naturais", "bolos-caseiros", "lanches-naturais", "paes-artesanais",
  "doces-geleias", "ovos-laticinios", "mel-derivados", "temperos-ervas", "graos-cereais",
  "conservas", "cestas-kits", "graos", "cosmeticos", "artesanato", "reuso", "moda",
]);

/**
 * Piloto de São Carlos: destaque é cortesia.
 *
 * Cobrar posição antes de existir movimento na vitrine queima a confiança da
 * primeira turma — e é o que a página de convite promete. A tabela acima
 * continua valendo como preço cheio; troque para `false` quando a cobrança voltar.
 */
export const PROMOTION_FREE_DURING_PILOT = true;

/** Preço de tabela. Serve para validar a combinação e para mostrar o valor cheio. */
export function promotionAmount(position: number, durationDays: number, scope: string): number | null {
  const weekly = PROMOTION_WEEKLY_PRICES.get(position);
  const multiplier = PROMOTION_DURATION_MULTIPLIER.get(durationDays);
  const scopeMultiplier = PROMOTION_SCOPE_MULTIPLIER.get(scope);
  return weekly && multiplier && scopeMultiplier ? Math.round(weekly * multiplier * scopeMultiplier) : null;
}

// Destaque de loja usa exatamente a mesma tabela de preços e escopos do destaque
// de produto: a diferença é só o que aparece na vitrine.

/**
 * O que a loja paga de fato. Devolve null para combinação inválida (posição ou
 * período fora da tabela) e 0 enquanto o piloto estiver de pé.
 */
export function promotionCharge(position: number, durationDays: number, scope: string): number | null {
  const table = promotionAmount(position, durationDays, scope);
  if (table === null) return null;
  return PROMOTION_FREE_DURING_PILOT ? 0 : table;
}
