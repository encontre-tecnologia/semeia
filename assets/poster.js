/**
 * Semeia — cartaz da loja para imprimir.
 *
 * A ponte que faltava entre o balcão e o site: quem está na fila aponta a
 * câmera, vê o cardápio e o preço, e vira uma visita medida no painel do
 * lojista. É a única peça que traz gente nova sem depender de o vendedor
 * responder nada no meio do movimento — ele imprime uma vez e cola na parede.
 *
 * Tudo acontece no navegador: nenhuma rota nova, nenhum dado gravado.
 * Depende de `qrcode.min.js`, o mesmo já usado no Pix.
 */
(function () {
  "use strict";

  // A4 em 150 dpi: imprime nítido em folha inteira e ainda cabe reduzido à metade.
  var LARGURA = 1240;
  var ALTURA = 1754;

  // Paleta clara, como a dos e-mails: cartaz escuro gasta tinta e some no papel.
  var PAPEL = "#F1EFE3";
  var TINTA = "#2B2418";
  var SUAVE = "#6B6353";
  var VERDE = "#5C6B33";
  var SERIFA = "Charter, 'Sitka Text', Cambria, Georgia, serif";
  var MONO = "'SF Mono', Consolas, monospace";

  /** Carrega uma imagem; devolve null em vez de falhar, para o cartaz sair mesmo assim. */
  function carregar(src, comCors) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      // Sem isto, uma imagem de outro domínio "suja" o canvas e o download morre.
      if (comCors) img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /** Desenha o QR fora da tela e devolve como imagem. */
  function qrComoImagem(texto, tamanho) {
    return new Promise(function (resolve) {
      if (typeof window.QRCode !== "function") return resolve(null);
      var caixa = document.createElement("div");
      caixa.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(caixa);
      new window.QRCode(caixa, {
        text: texto,
        width: tamanho,
        height: tamanho,
        colorDark: "#101C14",
        colorLight: "#ffffff",
        // Correção alta: o cartaz vive na parede, com sol, dobra e dedo em cima.
        correctLevel: window.QRCode.CorrectLevel.H,
      });
      // A biblioteca desenha em canvas e depois espelha num <img>; o canvas já serve.
      setTimeout(function () {
        var fonte = caixa.querySelector("canvas") || caixa.querySelector("img");
        var pronto = function () { caixa.remove(); resolve(fonte); };
        if (fonte && fonte.tagName === "IMG" && !fonte.complete) fonte.onload = pronto;
        else pronto();
      }, 60);
    });
  }

  /** Quebra o texto em linhas que caibam na largura, sem cortar palavra. */
  function linhas(ctx, texto, largura, maximo) {
    var palavras = String(texto || "").trim().split(/\s+/);
    var saida = [];
    var atual = "";
    for (var i = 0; i < palavras.length; i++) {
      var teste = atual ? atual + " " + palavras[i] : palavras[i];
      if (ctx.measureText(teste).width > largura && atual) {
        saida.push(atual);
        atual = palavras[i];
        if (saida.length === maximo) return saida;
      } else {
        atual = teste;
      }
    }
    if (atual && saida.length < maximo) saida.push(atual);
    return saida;
  }

  function circulo(ctx, img, x, y, raio) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + raio, y + raio, raio, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    // Recorte central: a logo raramente é quadrada.
    var lado = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, x, y, raio * 2, raio * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x + raio, y + raio, raio, 0, Math.PI * 2);
    ctx.strokeStyle = VERDE;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  /**
   * Monta o cartaz e devolve o canvas.
   * @param {{nome: string, url: string, logoUrl?: string, regiao?: string}} loja
   */
  async function montar(loja) {
    var canvas = document.createElement("canvas");
    canvas.width = LARGURA;
    canvas.height = ALTURA;
    var ctx = canvas.getContext("2d");

    ctx.fillStyle = PAPEL;
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    ctx.textAlign = "center";
    var meio = LARGURA / 2;

    var marca = await carregar("assets/semeia-mark.svg", false);
    var logo = await carregar(loja.logoUrl, true);

    /* O QR é o último a ser dimensionado: primeiro medimos quanto o cabeçalho
       vai ocupar — logo, nome em uma ou duas linhas, cidade e chamada — e o que
       sobra vira o tamanho dele. Com tamanho fixo, uma loja de nome comprido e
       com logo empurrava o endereço para cima do rodapé. */
    var tamanhoNome = loja.nome && loja.nome.length > 26 ? 68 : 86;
    ctx.font = "700 " + tamanhoNome + "px " + SERIFA;
    var nomeLinhas = linhas(ctx, loja.nome, LARGURA - 200, 2);
    var alturaTopo = 286
      + (logo ? 190 : 30)
      + nomeLinhas.length * (tamanhoNome + 10)
      + (loja.regiao ? 54 : 0)
      + 74 + 56 + 72;
    // 82 do respiro, 32 do endereço e 150 até o rodapé.
    var sobra = ALTURA - alturaTopo - 82 - 32 - 150;
    var ladoQr = Math.max(420, Math.min(720, Math.round(sobra)));
    var qr = await qrComoImagem(loja.url, ladoQr);

    // Cabeçalho: marca do Semeia
    var y = 148;
    if (marca) ctx.drawImage(marca, meio - 34, y - 46, 68, 68);
    ctx.fillStyle = VERDE;
    ctx.font = "700 30px " + MONO;
    ctx.fillText("SEMEIA", meio, y + 68);

    // Logo da loja, quando existe
    y = 286;
    if (logo) {
      circulo(ctx, logo, meio - 78, y, 78);
      y += 190;
    } else {
      y += 30;
    }

    // Nome da loja
    ctx.fillStyle = TINTA;
    ctx.font = "700 " + tamanhoNome + "px " + SERIFA;
    for (var i = 0; i < nomeLinhas.length; i++) {
      ctx.fillText(nomeLinhas[i], meio, y);
      y += tamanhoNome + 10;
    }

    if (loja.regiao) {
      ctx.fillStyle = SUAVE;
      ctx.font = "400 34px " + SERIFA;
      ctx.fillText(loja.regiao, meio, y + 6);
      y += 54;
    }

    // Chamada
    y += 74;
    ctx.fillStyle = TINTA;
    ctx.font = "700 46px " + SERIFA;
    ctx.fillText("Aponte a câmera do celular", meio, y);
    y += 56;
    ctx.fillStyle = SUAVE;
    ctx.font = "400 34px " + SERIFA;
    ctx.fillText("e veja o cardápio, os preços e o que tem hoje", meio, y);

    // QR com moldura branca — leitura melhor e sobra onde recortar.
    y += 72;
    if (qr) {
      var lado = ladoQr;
      var margem = 36;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(meio - lado / 2 - margem, y - margem, lado + margem * 2, lado + margem * 2);
      ctx.strokeStyle = "#D9D5C3";
      ctx.lineWidth = 2;
      ctx.strokeRect(meio - lado / 2 - margem, y - margem, lado + margem * 2, lado + margem * 2);
      ctx.drawImage(qr, meio - lado / 2, y, lado, lado);
      y += lado + margem + 82;
    }

    // Endereço escrito, para quem não usa QR
    ctx.fillStyle = VERDE;
    ctx.font = "700 32px " + MONO;
    ctx.fillText(loja.url.replace(/^https?:\/\//, ""), meio, y);

    // Rodapé
    ctx.fillStyle = SUAVE;
    ctx.font = "400 27px " + SERIFA;
    ctx.fillText("Combine retirada, entrega e pagamento direto com a loja.", meio, ALTURA - 70);

    return canvas;
  }

  /** Monta e entrega o arquivo pronto para imprimir. */
  async function baixar(loja) {
    var canvas = await montar(loja);
    var nomeArquivo = "cartaz-" + (loja.nome || "loja")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + ".png";
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error("Não foi possível gerar o cartaz."));
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        resolve(nomeArquivo);
      }, "image/png");
    });
  }

  window.SemeiaPoster = { montar: montar, baixar: baixar };
})();
