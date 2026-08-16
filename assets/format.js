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

  /**
   * "Até 5 km", "De 5 a 15 km", "Acima de 15 km" ou "Qualquer distância".
   * Quando o vendedor descreveu a faixa em palavras — por bairro, por região ou
   * por uma regra como "R$ 1,00 por km rodado" — é o texto dele que aparece.
   */
  function tierRange(tiers, index) {
    var list = tiers || [], tier = list[index];
    if (!tier) return "";
    if (tier.label) return tier.label;
    // Uma faixa em palavras não marca "onde a anterior terminou": a referência é
    // a última faixa numérica antes desta.
    var previous = null;
    for (var i = index - 1; i >= 0; i--) {
      if (!list[i].label && list[i].upToKm != null) { previous = list[i].upToKm; break; }
    }
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

  /* Selo de carbono do cartão. Vivia só na home, e a página da loja tinha uma
     versão própria — com ponto decimal e outro texto. Fica aqui para as duas
     mostrarem a mesma coisa. */
  var LEGENDA_CARBONO = "de gás carbônico na atmosfera";

  function carbonAmount(value) {
    var kg = Math.max(0, Number(value) || 0);
    return kg < 1
      ? Math.round(kg * 1000) + " g"
      : kg.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " kg";
  }

  function carbonSavedNode(value) {
    var node = document.createElement("span");
    node.className = "carbon-saved";
    var valor = document.createElement("strong");
    valor.className = "carbon-saved-value";
    valor.textContent = "−" + carbonAmount(value);
    var legenda = document.createElement("span");
    legenda.className = "carbon-saved-caption";
    legenda.textContent = LEGENDA_CARBONO;
    node.append(valor, legenda);
    node.setAttribute("aria-label", "menos " + carbonAmount(value) + " " + LEGENDA_CARBONO + " (estimativa)");
    return node;
  }

  window.SemeiaFormat = {
    carbonAmount: carbonAmount,
    carbonSavedNode: carbonSavedNode,
    carbonCaption: LEGENDA_CARBONO,
    money: money,
    priceChange: priceChange,
    kmText: kmText,
    tierRange: tierRange,
    tierFeeShort: tierFeeShort,
    tierFeeLabel: tierFeeLabel,
  };
})();
