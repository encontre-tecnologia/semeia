/**
 * Semeia — formatação de preço e frete, uma vez só.
 *
 * Estas funções estavam copiadas em index, loja, produto, sacola e checkout:
 * cinco versões do mesmo cálculo de porcentagem e do mesmo rótulo de faixa de
 * km. Um ajuste em uma das cópias deixava as outras contando outra história.
 *
 * Todas são puras: recebem número ou objeto e devolvem texto.
 */
(function () {
  "use strict";

  /** "R$ 12,00". Valor vazio ou inválido vira R$ 0,00, nunca "NaN". */
  function money(value) {
    return "R$ " + Number(value || 0).toFixed(2).replace(".", ",");
  }

  /**
   * Variação de preço pronta para exibir, ou null quando o preço nunca mudou.
   * A porcentagem vem da API quando existe; o cálculo local é a rede de proteção.
   */
  function priceChange(item) {
    var previous = Number(item.previousPrice), current = Number(item.price);
    if (!previous || !current || previous === current) return null;
    var up = previous < current;
    var percent = up
      ? Math.max(1, Number(item.increasePercent) || Math.round((current / previous - 1) * 100))
      : Math.max(1, Number(item.discountPercent) || Math.round((1 - current / previous) * 100));
    return { previous: previous, up: up, percent: percent, label: up ? "+" + percent + "%" : percent + "% OFF" };
  }

  /** 2.5 vira "2,5" — km aceita fração. */
  function kmText(value) {
    return String(value).replace(".", ",");
  }

  /** "Até 5 km", "De 5 a 15 km", "Acima de 15 km" ou "Qualquer distância". */
  function tierRange(tiers, index) {
    var list = tiers || [], tier = list[index], previous = index ? list[index - 1].upToKm : null;
    if (!tier) return "";
    if (tier.upToKm == null) return previous ? "Acima de " + kmText(previous) + " km" : "Qualquer distância";
    if (previous) return "De " + kmText(previous) + " a " + kmText(tier.upToKm) + " km";
    return "Até " + kmText(tier.upToKm) + " km";
  }

  /** Rótulo curto, para tabela: "A combinar" · "Grátis" · "R$ 8,00". */
  function tierFeeShort(tier) {
    return tier.feeCents == null ? "A combinar" : Number(tier.feeCents) === 0 ? "Grátis" : money(tier.feeCents / 100);
  }

  /** Rótulo dentro de frase, para o seletor: "frete a combinar" · "frete grátis". */
  function tierFeeLabel(tier) {
    return tier.feeCents == null ? "frete a combinar" : Number(tier.feeCents) === 0 ? "frete grátis" : money(tier.feeCents / 100);
  }

  window.SemeiaFormat = {
    money: money,
    priceChange: priceChange,
    kmText: kmText,
    tierRange: tierRange,
    tierFeeShort: tierFeeShort,
    tierFeeLabel: tierFeeLabel,
  };
})();
