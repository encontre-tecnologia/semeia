/**
 * Semeia — etiquetas de busca das páginas montadas no navegador.
 *
 * A vitrine da loja e a página do produto são desenhadas pelo JavaScript a
 * partir do banco. Sem isto, as duas iam para o Google com o mesmo título
 * genérico e a mesma descrição — o buscador não teria como diferenciar a
 * padaria da horta, e nenhuma das duas apareceria por nome.
 *
 * O Google executa o JavaScript da página antes de indexar, então o que
 * escrevemos aqui é lido por ele. Já os robôs de pré-visualização do WhatsApp e
 * das redes sociais NÃO executam JavaScript: para eles vale o que estiver no
 * HTML entregue pelo servidor.
 */
(function () {
  "use strict";

  /* O mesmo site responde em semeiabr.com e no endereço antigo do Cloudflare
     Pages. Se o endereço canônico saísse de location.origin, cada domínio
     apontaria para si mesmo e o buscador veria duas cópias do catálogo,
     dividindo a relevância entre elas. Aqui existe um endereço oficial só. */
  var SITE = "https://semeiabr.com";

  function absoluta(caminho) {
    return SITE + (caminho.charAt(0) === "/" ? caminho : "/" + caminho);
  }

  function tag(seletor, criar) {
    var el = document.head.querySelector(seletor);
    if (!el) {
      el = criar();
      document.head.appendChild(el);
    }
    return el;
  }

  function meta(nome, valor, propriedade) {
    if (!valor) return;
    var atributo = propriedade ? "property" : "name";
    var el = tag("meta[" + atributo + '="' + nome + '"]', function () {
      var novo = document.createElement("meta");
      novo.setAttribute(atributo, nome);
      return novo;
    });
    el.setAttribute("content", valor);
  }

  /** Corta a descrição no limite que o Google costuma exibir, sem partir palavra. */
  function resumo(texto, limite) {
    var t = String(texto || "").replace(/\s+/g, " ").trim();
    if (t.length <= limite) return t;
    var corte = t.slice(0, limite);
    return corte.slice(0, corte.lastIndexOf(" ")) + "…";
  }

  function pagina(dados) {
    if (dados.titulo) document.title = dados.titulo;
    meta("description", dados.descricao);
    meta("og:title", dados.titulo, true);
    meta("og:description", dados.descricao, true);
    meta("og:image", dados.imagem, true);

    if (dados.url) {
      var endereco = absoluta(dados.url);
      meta("og:url", endereco, true);
      tag('link[rel="canonical"]', function () {
        var l = document.createElement("link");
        l.rel = "canonical";
        return l;
      }).href = endereco;
    }

    if (dados.dados) {
      var script = tag('script[type="application/ld+json"][data-semeia]', function () {
        var s = document.createElement("script");
        s.type = "application/ld+json";
        s.setAttribute("data-semeia", "");
        return s;
      });
      script.textContent = JSON.stringify(dados.dados);
    }
  }

  window.SemeiaSEO = { pagina: pagina, resumo: resumo, absoluta: absoluta };
})();
