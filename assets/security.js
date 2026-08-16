(function () {
  "use strict";

  async function verify(root) {
    var field = root.querySelector('[name="cf-turnstile-response"]');
    var token = field && field.value;
    if (!token) throw new Error("Confirme a verificação de segurança antes de continuar.");
    var response = await fetch(window.SEMEIA_TURNSTILE_VERIFY_URL + "/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token }),
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.success) {
      if (window.turnstile) window.turnstile.reset();
      throw new Error("A verificação expirou. Marque novamente e tente outra vez.");
    }
    return true;
  }

  function widget(label) {
    var box = document.createElement("div");
    box.className = "semeia-security";
    box.innerHTML = '<span>' + (label || "Verificação de segurança") + '</span><div class="cf-turnstile" data-sitekey="' + window.SEMEIA_TURNSTILE_SITEKEY + '" data-action="turnstile-spin-v1" data-theme="dark"></div>';
    return box;
  }

  window.SemeiaSecurity = { verify: verify, widget: widget };
})();
