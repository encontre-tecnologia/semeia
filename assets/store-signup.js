(function () {
  "use strict";
  var form = document.getElementById("signup-form");
  var message = document.getElementById("confirm-msg");
  var button = form.querySelector('button[type="submit"]');
  var categorySelect = document.getElementById("cat");

  Object.keys(window.CATS || {}).forEach(function (key) {
    var category = window.CATS[key];
    var option = document.createElement("option");
    option.value = category.label;
    option.textContent = (category.icon ? category.icon + "  " : "") + category.label;
    categorySelect.appendChild(option);
  });
  var otherOption = document.createElement("option");
  otherOption.value = "Outra";
  otherOption.textContent = "Outra categoria";
  categorySelect.appendChild(otherOption);

  function slugFor(dictionary, label) {
    return Object.keys(dictionary).find(function (key) {
      var value = dictionary[key];
      return (typeof value === "string" ? value : value.label) === label;
    }) || label;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Confirmando com Google…";
    message.classList.remove("show");
    try {
      await window.SemeiaSecurity.verify(form);
      var firebase = await window.SemeiaFirebaseReady;
      var idToken = await firebase.signInWithGoogle();
      await window.SemeiaAPI.createStore({
        name: document.getElementById("biz").value.trim(),
        contactName: document.getElementById("contact").value.trim(),
        email: document.getElementById("email").value.trim(),
        whatsapp: document.getElementById("whats").value.trim(),
        category: slugFor(window.CATS, document.getElementById("cat").value),
        region: document.getElementById("region").value.trim(),
        seals: [],
        idToken: idToken,
        pixKey: document.getElementById("pix-key").value.trim(),
        pixName: document.getElementById("pix-name").value.trim(),
        pixCity: document.getElementById("pix-city").value.trim(),
      });
      sessionStorage.removeItem("semeia-store-login");
      location.href = "minha-loja.html";
    } catch (error) {
      message.textContent = error.message || "Não foi possível enviar o cadastro.";
      message.classList.add("show");
      if (window.turnstile) window.turnstile.reset();
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>Enviar cadastro</span><span aria-hidden="true">→</span>';
    }
  });

  if (typeof window.setupUIInteractions === "function") window.setupUIInteractions();
})();
