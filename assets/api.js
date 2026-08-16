/**
 * Semeia — ponte entre o site estático e a API (Cloudflare Workers).
 *
 * Se a API estiver no ar, os dados vêm dela. Se não estiver, o site continua
 * funcionando com os dados de demonstração de `data.js` — assim dá pra abrir
 * o protótipo em qualquer lugar sem depender do backend.
 *
 * Para apontar para outra URL, defina antes de carregar este arquivo:
 *   <script>window.SEMEIA_API_URL = "https://semeia-api.seu-subdominio.workers.dev";</script>
 */

window.SEMEIA_API_URL = window.SEMEIA_API_URL || "http://localhost:8787";

var SemeiaAPI = (function () {
  var BASE = String(window.SEMEIA_API_URL).replace(/\/+$/, "");
  var TIMEOUT_MS = 4000;
  var live = null; // null = ainda não sabemos; true/false depois da 1ª chamada

  // Abrir o HTML com duplo clique usa o protocolo file://, onde cada arquivo é uma
  // origem única e o navegador bloqueia qualquer fetch. Nem tentamos: iria falhar
  // sempre e só encheria o console de erro. Para usar a API, sirva por http.
  var CAN_FETCH =
    window.location.protocol !== "file:" && window.SEMEIA_API_ENABLED !== false;

  function request(path, options) {
    if (!CAN_FETCH) {
      live = false;
      return Promise.reject(
        new Error("API em modo demonstração ou indisponível ao abrir o arquivo direto."),
      );
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    var config = Object.assign({ signal: controller.signal }, options || {});
    if (config.body && !config.headers) config.headers = { "content-type": "application/json" };

    return fetch(BASE + path, config)
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            var error = new Error(data.error || ("HTTP " + response.status));
            error.status = response.status;
            error.payload = data;
            throw error;
          }
          live = true;
          return data;
        });
      })
      .catch(function (err) {
        // Erro de rede (API fora do ar) marca o modo offline. Erro HTTP não —
        // a API respondeu, só recusou a operação.
        if (err.status === undefined) live = false;
        throw err;
      })
      .finally(function () { clearTimeout(timer); });
  }

  /** A API devolve `description`; o site usa `desc`. Mantém os dois preenchidos. */
  function normalizeProduct(product) {
    if (product && product.description && !product.desc) product.desc = product.description;
    if (product && product.desc && !product.description) product.description = product.desc;
    if (product && !Array.isArray(product.imageUrls)) product.imageUrls = product.imageUrl ? [product.imageUrl] : [];
    if (product && !product.imageUrl && product.imageUrls.length) product.imageUrl = product.imageUrls[0];
    return product;
  }

  function localProducts() {
    return (window.PRODUCTS || []).map(function (p) {
      return normalizeProduct(Object.assign({}, p));
    });
  }

  // Identificador aleatório apenas para impedir que a mesma visita seja contada
  // várias vezes no mesmo dia. Não contém nome, e-mail ou telefone.
  function metricClientId() {
    var key = "semeia-metric-client-v1";
    try {
      var saved = localStorage.getItem(key);
      if (saved && /^[a-zA-Z0-9_-]{16,96}$/.test(saved)) return saved;
      var value = window.crypto && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : "m" + Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem(key, value);
      return value;
    } catch (_) {
      return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
  }

  return {
    /** true = último acesso veio da API; false = caiu no fallback local. */
    isLive: function () { return live === true; },

    /**
     * Catálogo completo. Por padrão cai nos dados locais se a API falhar; passe
     * `{ local: false }` para receber a falha e mostrar um estado honesto na
     * tela em vez de produtos de demonstração que não existem no banco.
     */
    loadProducts: function (options) {
      if (window.SEMEIA_USE_LOCAL_CATALOG) return Promise.resolve(localProducts());
      var allowLocal = !options || options.local !== false;
      return request("/api/products")
        .then(function (data) { return data.products.map(normalizeProduct); })
        .catch(function (error) {
          if (allowLocal) return localProducts();
          throw error;
        });
    },

    /** Uma página do catálogo para telas com "carregar mais". */
    loadProductsPage: function (page, limit) {
      return request("/api/products?page=" + encodeURIComponent(page || 1) + "&limit=" + encodeURIComponent(limit || 24))
        .then(function (data) {
          return { products: data.products.map(normalizeProduct), pagination: data.pagination };
        });
    },

    /** Lojas aprovadas, inclusive as que ainda não publicaram produtos. */
    /** Lojas com destaque pago ativo, na ordem das posições contratadas. */
    loadFeaturedStores: function () {
      return request("/api/stores/featured").catch(function () { return { stores: [] }; });
    },

    loadStores: function () {
      return request("/api/stores")
        .then(function (data) { return Array.isArray(data.stores) ? data.stores : []; })
        .catch(function () { return []; });
    },

    /** Um produto pelo id, com o mesmo fallback. */
    loadProduct: function (id) {
      if (window.SEMEIA_USE_LOCAL_CATALOG) {
        var local = localProducts().filter(function (p) { return p.id === id; })[0];
        return Promise.resolve(local || localProducts()[0] || null);
      }
      return request("/api/products/" + encodeURIComponent(id))
        .then(function (data) {
          // Nunca bloqueia a renderização. O servidor deduplica por dia e navegador.
          request("/api/metrics", { method: "POST", body: JSON.stringify({ eventType: "product_view", productId: id, clientId: metricClientId() }) }).catch(function () {});
          return normalizeProduct(data.product);
        })
        .catch(function () {
          var found = localProducts().filter(function (p) { return p.id === id; })[0];
          return found || localProducts()[0] || null;
        });
    },

    /** Números reais de impacto. Devolve null se a API não responder. */
    loadImpact: function () {
      return request("/api/impact").catch(function () { return null; });
    },

    /** Registra uma finalização direta de forma idempotente. */
    confirmImpact: function (payload) {
      return request("/api/impact/confirm", { method: "POST", body: JSON.stringify(payload) });
    },

    /** Métrica agregada para a loja, sem dados pessoais do visitante. */
    trackMetric: function (eventType, data) {
      return request("/api/metrics", {
        method: "POST",
        body: JSON.stringify(Object.assign({ eventType: eventType, clientId: metricClientId() }, data || {})),
      }).catch(function () { return null; });
    },

    /** Cadastro de loja. Aqui o erro sobe — o formulário precisa saber que falhou. */
    createStore: function (payload) {
      return request("/api/stores", { method: "POST", body: JSON.stringify(payload) });
    },
  };
})();
