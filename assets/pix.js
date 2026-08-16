/**
 * Semeia — geração do código Pix (BR Code / EMV) no navegador.
 *
 * Estava copiado em três páginas (produto, checkout e painel do vendedor), cada
 * uma com o seu próprio CRC. Como um dígito errado aqui gera um QR que o banco
 * recusa, o código vive num lugar só.
 *
 * O nome do titular que aparece no aplicativo do banco é sempre o real: os
 * campos 59/60 daqui são apenas identificação dentro do payload.
 */
(function () {
  "use strict";

  function isValidCpf(value) {
    if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
    var sum = 0, index, digit;
    for (index = 0; index < 9; index++) sum += Number(value[index]) * (10 - index);
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(value[9])) return false;
    sum = 0;
    for (index = 0; index < 10; index++) sum += Number(value[index]) * (11 - index);
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    return digit === Number(value[10]);
  }

  /** Normaliza a chave para o formato que o BR Code espera (telefone com +55, CPF só dígitos…). */
  function normalizeKey(value) {
    var raw = String(value || "").trim();
    if (raw.includes("@")) return raw.toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return raw.toLowerCase();
    var digits = raw.replace(/\D/g, "");
    if (digits.length === 14) return digits;
    if (digits.length === 11 && isValidCpf(digits)) return digits;
    if (digits.length === 13 && digits.slice(0, 2) === "55") return "+" + digits;
    if (/^[1-9]\d9\d{8}$/.test(digits)) return "+55" + digits;
    return raw;
  }

  /** Texto dos campos 59/60: sem acento, sem símbolo, caixa alta e truncado. */
  function text(value, max) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .toUpperCase()
      .trim()
      .slice(0, max) || "SEM NOME";
  }

  function field(id, value) {
    return id + String(value.length).padStart(2, "0") + value;
  }

  /** CRC16/CCITT-FALSE, exigido pelo BR Code no campo 63. */
  function crc(value) {
    var result = 0xFFFF;
    for (var index = 0; index < value.length; index++) {
      result ^= value.charCodeAt(index) << 8;
      for (var bit = 0; bit < 8; bit++) {
        result = (result & 0x8000) ? ((result << 1) ^ 0x1021) & 0xFFFF : (result << 1) & 0xFFFF;
      }
    }
    return result.toString(16).toUpperCase().padStart(4, "0");
  }

  /**
   * Código copia-e-cola com valor. `key` aceita o formato que o lojista digitou;
   * passe `rawKey: true` quando a chave já vier pronta para o payload.
   */
  function payload(options) {
    var settings = options || {};
    var key = settings.rawKey ? String(settings.key || "") : normalizeKey(settings.key);
    var account = field("00", "BR.GOV.BCB.PIX") + field("01", key);
    var base = "000201"
      + field("26", account)
      + "52040000"
      + "5303986"
      + field("54", Number(settings.amount).toFixed(2))
      + "5802BR"
      + field("59", text(settings.name, 25))
      + field("60", text(settings.city, 15))
      + "62070503***"
      + "6304";
    return base + crc(base);
  }

  window.SemeiaPix = { payload: payload, normalizeKey: normalizeKey, text: text };
})();
