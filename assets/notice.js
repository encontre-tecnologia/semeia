/**
 * Semeia — avisos e confirmações em pop-up, no lugar de alert()/confirm() do navegador.
 *
 * SemeiaNotice.alert("mensagem")            -> Promise que resolve ao fechar
 * SemeiaNotice.confirm("pergunta")          -> Promise<boolean>
 * Ambos aceitam { title, confirmLabel, cancelLabel, tone: "danger" }.
 */
(function () {
  "use strict";

  var STYLE = [
    '.semeia-notice{width:min(430px,calc(100% - 1.6rem));padding:0;border:1px solid color-mix(in srgb,var(--accent) 34%,var(--line));border-radius:22px;color:var(--ink);background:linear-gradient(150deg,color-mix(in srgb,var(--paper-raised) 96%,transparent),color-mix(in srgb,var(--accent) 6%,var(--paper-raised)));box-shadow:0 34px 85px -38px #000}',
    '.semeia-notice::backdrop{background:rgba(4,13,8,.7);backdrop-filter:blur(6px)}',
    '.semeia-notice-inner{padding:1.5rem}',
    '.semeia-notice-title{margin:0 0 .5rem;font-size:1.2rem;line-height:1.25}',
    '.semeia-notice-text{margin:0;color:var(--ink-soft);font-size:.86rem;line-height:1.55;overflow-wrap:anywhere}',
    '.semeia-notice-actions{display:flex;justify-content:flex-end;gap:.55rem;margin-top:1.35rem}',
    '.semeia-notice-actions button{min-height:2.85rem;padding:.6rem 1.15rem;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--ink-soft);font:700 .8rem ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:border-color .15s,color .15s,background .15s}',
    '.semeia-notice-actions button:hover{border-color:var(--accent);color:var(--ink)}',
    '.semeia-notice-actions .is-main{border-color:transparent;color:#0f2415;background:var(--accent)}',
    '.semeia-notice-actions .is-main:hover{color:#0f2415;filter:brightness(1.06)}',
    '.semeia-notice-actions .is-danger{border-color:transparent;color:#2a1310;background:#df8c76}',
    '@media(max-width:470px){.semeia-notice-actions{flex-direction:column-reverse}.semeia-notice-actions button{width:100%}}',
  ].join("");

  function ensureStyle() {
    if (document.getElementById("semeia-notice-style")) return;
    var style = document.createElement("style");
    style.id = "semeia-notice-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function open(message, options, withCancel) {
    var settings = options || {};
    ensureStyle();

    var dialog = document.createElement("dialog");
    dialog.className = "semeia-notice";
    var inner = document.createElement("div");
    inner.className = "semeia-notice-inner";
    var title = document.createElement("h3");
    title.className = "semeia-notice-title";
    title.textContent = settings.title || (withCancel ? "Confirmar" : "Atenção");
    var text = document.createElement("p");
    text.className = "semeia-notice-text";
    text.textContent = String(message == null ? "" : message);
    var actions = document.createElement("div");
    actions.className = "semeia-notice-actions";

    var confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "is-main" + (settings.tone === "danger" ? " is-danger" : "");
    confirmButton.textContent = settings.confirmLabel || (withCancel ? "Confirmar" : "Entendi");

    inner.append(title, text, actions);
    var cancelButton = null;
    if (withCancel) {
      cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = settings.cancelLabel || "Cancelar";
      actions.appendChild(cancelButton);
    }
    actions.appendChild(confirmButton);
    dialog.appendChild(inner);
    document.body.appendChild(dialog);

    return new Promise(function (resolve) {
      var settled = false;
      function close(result) {
        if (settled) return;
        settled = true;
        resolve(result);
        if (dialog.open) dialog.close();
        dialog.remove();
      }
      confirmButton.onclick = function () { close(true); };
      if (cancelButton) cancelButton.onclick = function () { close(false); };
      // Esc fecha o diálogo nativo: cancelar é a resposta segura.
      dialog.addEventListener("cancel", function (event) { event.preventDefault(); close(!withCancel); });
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      setTimeout(function () { confirmButton.focus(); }, 30);
    });
  }

  window.SemeiaNotice = {
    alert: function (message, options) { return open(message, options, false); },
    confirm: function (message, options) { return open(message, options, true); },
  };
})();
