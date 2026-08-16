/**
 * Semeia — sacola do comprador.
 *
 * Fica só no navegador (localStorage): não existe conta de comprador, e o
 * pagamento acontece fora da plataforma. Guardamos apenas id e quantidade —
 * preço, estoque e frete são relidos da API a cada abertura da sacola, para
 * ninguém fechar pedido com valor velho.
 */
(function () {
  "use strict";

  var KEY = "semeia-cart";
  var MAX_ITEMS = 30;
  var MAX_QUANTITY = 999;

  function read() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved
        .filter(function (item) { return item && typeof item.productId === "string"; })
        .map(function (item) {
          return { productId: item.productId, quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(Number(item.quantity) || 1))) };
        })
        .slice(0, MAX_ITEMS);
    } catch (_) {
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch (_) {}
    document.dispatchEvent(new CustomEvent("semeia-cart-change", { detail: { items: items } }));
    paintBadges();
    return items;
  }

  function count() {
    return read().reduce(function (total, item) { return total + item.quantity; }, 0);
  }

  function add(productId, quantity) {
    var items = read();
    var wanted = Math.max(1, Math.round(Number(quantity) || 1));
    var existing = items.filter(function (item) { return item.productId === productId; })[0];
    if (existing) existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + wanted);
    else {
      if (items.length >= MAX_ITEMS) return { ok: false, reason: "full" };
      items.push({ productId: productId, quantity: Math.min(MAX_QUANTITY, wanted) });
    }
    write(items);
    return { ok: true, quantity: existing ? existing.quantity : wanted };
  }

  function setQuantity(productId, quantity) {
    var wanted = Math.round(Number(quantity) || 0);
    if (wanted < 1) return remove(productId);
    return write(read().map(function (item) {
      return item.productId === productId ? { productId: productId, quantity: Math.min(MAX_QUANTITY, wanted) } : item;
    }));
  }

  function remove(productId) {
    return write(read().filter(function (item) { return item.productId !== productId; }));
  }

  /** Tira da sacola os itens de um pedido já finalizado. */
  function removeMany(productIds) {
    var ids = productIds || [];
    return write(read().filter(function (item) { return ids.indexOf(item.productId) === -1; }));
  }

  function clear() {
    return write([]);
  }

  // O contador aparece em qualquer link marcado com data-cart-count.
  function paintBadges() {
    var total = count();
    document.querySelectorAll("[data-cart-count]").forEach(function (badge) {
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.hidden = total === 0;
    });
  }

  window.SemeiaCart = {
    items: read,
    count: count,
    add: add,
    setQuantity: setQuantity,
    remove: remove,
    removeMany: removeMany,
    clear: clear,
    refreshBadges: paintBadges,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintBadges);
  else paintBadges();
  // Sacola aberta em outra aba também atualiza o contador desta.
  window.addEventListener("storage", function (event) { if (event.key === KEY) paintBadges(); });
})();
