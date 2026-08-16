// Semeia — utilitários compartilhados de UI

// Guarda a animação em curso de cada elemento, para que uma nova chamada
// cancele a anterior em vez de as duas disputarem o mesmo texto.
var counterRuns = new WeakMap();

function animateCounter(el, target, opts) {
  opts = opts || {};
  var suffix = opts.suffix || "";
  var duration = opts.duration || 1400;
  var decimals = opts.decimals || 0;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function format(n) {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  }

  var previous = counterRuns.get(el);
  if (previous) cancelAnimationFrame(previous);

  if (reduced) {
    counterRuns.delete(el);
    el.textContent = format(target);
    return;
  }

  var start = null;
  function step(ts) {
    if (!start) start = ts;
    var progress = Math.min((ts - start) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = format(eased * target);
    if (progress < 1) {
      counterRuns.set(el, requestAnimationFrame(step));
    } else {
      counterRuns.delete(el);
    }
  }
  counterRuns.set(el, requestAnimationFrame(step));
}

function setupReveal(selector) {
  var els = document.querySelectorAll(selector || ".reveal");
  if (!("IntersectionObserver" in window) || !els.length) {
    els.forEach(function (e) { e.classList.add("in"); });
    return;
  }
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  els.forEach(function (e) { obs.observe(e); });
}

// Canvas ambiente de folhas caindo lentamente — decorativo, leve, respeita reduced-motion
function initLeafCanvas(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var ctx = canvas.getContext("2d");
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var leaves = [];
  var count = window.innerWidth < 640 ? 18 : 30;

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
  }

  function makeLeaf() {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    return {
      x: Math.random() * w,
      y: Math.random() * (h + 40) - 20,
      size: 5 + Math.random() * 9.5,
      speed: 0.2 + Math.random() * 0.58,
      drift: (Math.random() - 0.5) * 0.85,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.026,
      opacity: 0.22 + Math.random() * 0.5
    };
  }

  resize();
  for (var i = 0; i < count; i++) leaves.push(makeLeaf());
  window.addEventListener("resize", resize);

  var accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6B7A3F";

  function draw() {
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    leaves.forEach(function (leaf) {
      leaf.y += leaf.speed;
      leaf.x += leaf.drift;
      leaf.angle += leaf.spin;
      if (leaf.y > h + 10) { leaf.y = -10; leaf.x = Math.random() * w; }

      ctx.save();
      ctx.translate(leaf.x, leaf.y);
      ctx.rotate(leaf.angle);
      ctx.globalAlpha = leaf.opacity;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, 0, leaf.size, leaf.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// Microinterações compartilhadas: navegação, cartões e feedback tátil dos botões.
function setupUIInteractions(root) {
  root = root || document;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var header = document.querySelector("header.site-nav");

  if (header && !header.dataset.scrollReady) {
    header.dataset.scrollReady = "true";
    var syncHeader = function () { header.classList.toggle("scrolled", window.scrollY > 12); };
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
  }

  root.querySelectorAll(".btn").forEach(function (button) {
    if (button.dataset.rippleReady) return;
    button.dataset.rippleReady = "true";
    button.addEventListener("pointerdown", function (event) {
      var rect = button.getBoundingClientRect();
      button.style.setProperty("--ripple-x", (event.clientX - rect.left) + "px");
      button.style.setProperty("--ripple-y", (event.clientY - rect.top) + "px");
      button.classList.remove("ripple");
      void button.offsetWidth;
      button.classList.add("ripple");
    });
  });

  if (reduced) return;
  root.querySelectorAll(".card").forEach(function (card) {
    if (card.dataset.tiltReady) return;
    card.dataset.tiltReady = "true";
    card.addEventListener("pointermove", function (event) {
      if (event.pointerType === "touch") return;
      var rect = card.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width;
      var y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty("--pointer-x", (x * 100) + "%");
      card.style.setProperty("--pointer-y", (y * 100) + "%");
      card.style.setProperty("--tilt-x", ((.5 - y) * 3) + "deg");
      card.style.setProperty("--tilt-y", ((x - .5) * 3) + "deg");
    });
    card.addEventListener("pointerleave", function () {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  });
}

function setupSiteMenu() {
  var inner = document.querySelector("header.site-nav .inner");
  if (!inner || inner.dataset.menuReady) return;
  inner.dataset.menuReady = "true";

  // A marca funciona como uma saída universal para a home, inclusive nas
  // páginas antigas em que ela ainda foi criada como uma simples <div>.
  var brand = inner.querySelector(".brand");
  if (brand && brand.tagName !== "A") {
    var brandLink = document.createElement("a");
    brandLink.className = brand.className;
    brandLink.href = "index.html";
    brandLink.setAttribute("aria-label", "Ir para o início do Semeia");
    while (brand.firstChild) brandLink.appendChild(brand.firstChild);
    brand.replaceWith(brandLink);
  }

  var desktopNav = inner.querySelector("nav");
  if (desktopNav) {
    if (!desktopNav.querySelector('[data-home-link]')) {
      var homeLink = document.createElement("a");
      homeLink.href = "index.html";
      homeLink.dataset.homeLink = "true";
      homeLink.textContent = "In\u00edcio";
      desktopNav.insertBefore(homeLink, desktopNav.firstChild);
    }
    if (!desktopNav.querySelector('[href="beneficios.html"]')) {
      var health = document.createElement("a");
      health.href = "beneficios.html";
      health.textContent = "Benefícios à saúde";
      desktopNav.appendChild(health);
    }
    if (!desktopNav.querySelector('[href="minha-loja.html"]')) {
      var myStore = document.createElement("a");
      myStore.href = "minha-loja.html";
      myStore.textContent = "Minha loja";
      desktopNav.appendChild(myStore);
    }
    if (!desktopNav.querySelector('[href="cadastro-loja.html"]')) {
      var register = document.createElement("a");
      register.href = "cadastro-loja.html";
      register.textContent = "Cadastrar loja";
      desktopNav.appendChild(register);
    }
  }
  var toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "menu-toggle"; toggle.setAttribute("aria-expanded", "false"); toggle.textContent = "Menu";
  var menu = document.createElement("aside");
  menu.className = "side-menu";
  menu.innerHTML = '<div class="side-menu-backdrop"></div><div class="side-menu-panel" role="dialog" aria-modal="true" aria-label="Menu"><div class="side-menu-head"><strong>Semeia</strong><button class="side-menu-close" type="button" aria-label="Fechar menu">×</button></div><nav class="side-menu-links"><a href="index.html">Início</a><a href="index.html#produtos">Explorar produtos</a><a href="minha-loja.html">Minha loja</a><a href="cadastro-loja.html">Cadastrar uma loja</a><a href="beneficios.html">Benefícios à saúde</a><a href="index.html#como-funciona">Como funciona</a><a href="privacidade.html">Privacidade e LGPD</a></nav></div>';
  function close(){menu.classList.remove("open");document.body.classList.remove("menu-open");toggle.setAttribute("aria-expanded","false");}
  toggle.addEventListener("click",function(){var open=menu.classList.toggle("open");document.body.classList.toggle("menu-open",open);toggle.setAttribute("aria-expanded",String(open));});
  menu.querySelector(".side-menu-backdrop").addEventListener("click",close);menu.querySelector(".side-menu-close").addEventListener("click",close);
  inner.insertBefore(toggle, inner.firstChild);document.body.appendChild(menu);
}

function setupLegalConsent() {
  var consentKey = "semeia-legal-consent-v1";
  var legalPath = location.pathname.replace(/\/+$/, "");
  if (/\/(privacidade|termos)(?:\.html)?$/i.test(legalPath)) return;
  try { if (localStorage.getItem(consentKey)) return; } catch (_) { /* segue exibindo */ }
  if (document.querySelector("#legal-consent-dialog")) return;
  var dialog = document.createElement("dialog");
  dialog.id = "legal-consent-dialog";
  dialog.className = "legal-consent";
  dialog.setAttribute("aria-labelledby", "legal-consent-title");
  dialog.innerHTML = '<div class="legal-consent-mark" aria-hidden="true"><img src="assets/semeia-mark.svg" alt=""></div><span class="legal-consent-kicker">Antes de continuar</span><h2 id="legal-consent-title">Uma relação clara começa pela confiança.</h2><p>O Semeia aproxima compradores e vendedores locais. Pagamento, retirada e entrega são combinados diretamente com cada loja.</p><div class="legal-consent-links"><a href="termos.html" target="_blank" rel="noopener">Ler os Termos de uso ↗</a><a href="privacidade.html" target="_blank" rel="noopener">Privacidade e LGPD ↗</a></div><label class="legal-consent-check"><input type="checkbox" id="legal-consent-check"><span>Li e concordo com os Termos de uso e declaro estar ciente da Política de Privacidade e LGPD.</span></label><button class="btn btn-primary legal-consent-accept" id="legal-consent-accept" type="button" disabled>Concordar e continuar</button><small>Você precisa concordar para usar o Semeia. O aceite fica salvo somente neste navegador.</small>';
  document.body.appendChild(dialog);
  var checkbox = dialog.querySelector("#legal-consent-check");
  var accept = dialog.querySelector("#legal-consent-accept");
  checkbox.addEventListener("change", function () { accept.disabled = !checkbox.checked; });
  accept.addEventListener("click", function () {
    if (!checkbox.checked) return;
    try { localStorage.setItem(consentKey, JSON.stringify({ version: 1, acceptedAt: new Date().toISOString() })); } catch (_) { /* sessão ainda pode continuar */ }
    dialog.close(); dialog.remove();
  });
  dialog.addEventListener("cancel", function (event) { event.preventDefault(); });
  dialog.showModal();
  setTimeout(function () { checkbox.focus(); }, 50);
}

function setupSiteFooter() {
  if (document.querySelector(".site-footer .footer-shell")) return;
  document.querySelectorAll("footer").forEach(function (existingFooter) {
    existingFooter.remove();
  });
  var footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML =
    '<div class="footer-glow" aria-hidden="true"></div>' +
    '<div class="wrap footer-shell">' +
      '<div class="footer-invite">' +
        '<div><span class="footer-kicker">Feito perto. Escolhido com cuidado.</span><h2>Do bairro para a sua mesa.</h2><p>Descubra pequenos negócios, produtores e produtos da sua região e converse diretamente com a loja.</p></div>' +
        '<a class="footer-cta" href="index.html#produtos">Explorar produtos <span aria-hidden="true">→</span></a>' +
      '</div>' +
      '<div class="footer-main">' +
        '<div class="footer-about"><a class="footer-brand" href="index.html" aria-label="Semeia — página inicial"><img src="assets/semeia-mark.svg" alt=""><span>Semeia</span></a><p>Uma vitrine para aproximar pessoas, pequenos negócios e produtores da região.</p><span class="footer-local"><i aria-hidden="true"></i> Marketplace local brasileiro</span></div>' +
        '<nav class="footer-column" aria-label="Descobrir"><strong>Descobrir</strong><a href="index.html">Início</a><a href="index.html#produtos">Produtos</a><a href="beneficios.html">Benefícios à saúde</a><a href="index.html#como-funciona">Como funciona</a></nav>' +
        '<nav class="footer-column" aria-label="Para vendedores"><strong>Para vendedores</strong><a href="minha-loja.html">Minha loja</a><a href="cadastro-loja.html">Cadastrar loja</a><a href="mailto:encontretecnologia2@gmail.com">Falar com o Semeia</a></nav>' +
        '<nav class="footer-column" aria-label="Transparência"><strong>Transparência</strong><a href="privacidade.html">Privacidade e LGPD</a><a href="termos.html">Termos de uso</a><span>Impacto estimado,<br>sempre explicado.</span></nav>' +
      '</div>' +
      '<div class="footer-bottom"><span>© ' + new Date().getFullYear() + ' Semeia. Cultivando conexões locais.</span><span>Pagamentos, retirada e entrega são combinados diretamente com cada vendedor.</span><a href="#" data-back-top>Voltar ao topo ↑</a></div>' +
    '</div>';
  document.body.appendChild(footer);
  var backTop = footer.querySelector("[data-back-top]");
  backTop.addEventListener("click", function (event) {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}

async function restoreStoreSession() {
  var dash = document.querySelector("#dash");
  if (!dash || !dash.hidden) return;
  try {
    var firebase = await import("./firebase-auth.js");
    var idToken = await firebase.restoreIdToken();
    if (!idToken) return;
    var response = await fetch(SEMEIA_API_URL.replace(/\/$/, "") + "/api/store/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: idToken }) });
    var data = await response.json();
    if (!response.ok) return;
    document.querySelector("#login").hidden = true;
    document.querySelector("#name").textContent = data.store.name;
    document.querySelector("#meta").textContent = data.store.region + " · " + data.store.email;
    var status = document.querySelector("#status");
    status.textContent = data.store.status === "approved" ? "Loja aprovada. Você já pode publicar produtos." : "Cadastro em análise. Você poderá publicar quando sua loja for aprovada.";
    status.className = "notice " + (data.store.status === "pending" ? "pending" : "");
    document.querySelector("#products").innerHTML = data.products.length ? data.products.map(function (product) { return "<p><strong>" + product.name + "</strong> · R$ " + product.price.toFixed(2).replace(".", ",") + product.unit + "</p>"; }).join("") : "<p>Nenhum produto publicado ainda.</p>";
    dash.hidden = false;
    document.querySelector("#publish").hidden = data.store.status !== "approved";
  } catch (_) { /* a tela continua oferecendo login normal */ }
}

document.addEventListener("DOMContentLoaded", function () { setupSiteMenu(); setupSiteFooter(); setupLegalConsent(); void restoreStoreSession(); });

/**
 * Traduz uma estimativa de CO2 evitado em algo palpável.
 *
 * A referência é ~21 kg de CO2 por ano de uma árvore adulta. Serve para dar
 * escala à conta, não como certificação: por isso a escala muda com o valor,
 * para nunca aparecer "0,16 árvore".
 */
var SEMEIA_TREE_KG_PER_YEAR = 21;

function semeiaTreeEquivalent(kg) {
  var treeYears = Number(kg || 0) / SEMEIA_TREE_KG_PER_YEAR;
  if (treeYears >= 1) {
    var trees = Math.round(treeYears);
    return "o mesmo que " + trees + (trees === 1 ? " árvore absorve" : " árvores absorvem") + " em um ano";
  }
  var days = Math.round(treeYears * 365);
  if (days >= 60) return "o mesmo que uma árvore absorve em cerca de " + Math.round(days / 30) + " meses";
  if (days >= 2) return "o mesmo que uma árvore absorve em cerca de " + days + " dias";
  return "uma pequena ajuda para o ar da sua cidade";
}

function semeiaImpactAmount(kg) {
  var grams = Math.round(Number(kg || 0) * 1000);
  return grams >= 1000
    ? (grams / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " kg"
    : grams + " g";
}
