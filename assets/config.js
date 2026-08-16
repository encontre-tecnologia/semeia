/**
 * Semeia — configuração do site.
 *
 * O endereço da API fica fixo aqui, apontando sempre para produção. Se você
 * precisar testar contra a API local, NÃO edite este arquivo: rode isto no
 * console do navegador e recarregue —
 *
 *     localStorage.setItem("semeia-api-url", "http://localhost:8787")
 *
 * e para voltar ao normal:
 *
 *     localStorage.removeItem("semeia-api-url")
 *
 * Assim um teste local nunca é publicado por acidente. Já aconteceu: um
 * `localhost` esquecido aqui foi para o ar e o site caía nos dados de
 * demonstração porque não conseguia falar com a API.
 */

var SEMEIA_PRODUCTION_API = "https://semeia-api.encontretecnologia2.workers.dev";

window.SEMEIA_API_URL = (function () {
  try {
    var override = localStorage.getItem("semeia-api-url");
    if (override && /^https?:\/\//.test(override)) {
      console.info("[Semeia] usando API de teste: " + override);
      return override;
    }
  } catch (_) {}
  return SEMEIA_PRODUCTION_API;
})();

// Catálogo visual local durante o piloto; o cadastro usa a API.
window.SEMEIA_API_ENABLED = true;
// Catálogo de demonstração (assets/data.js). Com `false`, a home e a página de
// produtos mostram só o que existe no banco — se a API cair, aparece um aviso
// com "tentar de novo" em vez de lojas que não existem.
window.SEMEIA_USE_LOCAL_CATALOG = false;

// Cloudflare Turnstile (widget gerenciado + verificador oficial Spin).
window.SEMEIA_TURNSTILE_SITEKEY = "0x4AAAAAAENPXnq4jBtZ6CA3";
window.SEMEIA_TURNSTILE_VERIFY_URL = "https://semeia-turnstile-siteverify.encontretecnologia2.workers.dev";
