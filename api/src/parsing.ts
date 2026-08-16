/**
 * Semeia — leitura e validação dos dados crus (JSON do banco e corpo das requisições).
 *
 * Tudo aqui é função pura: não toca no banco nem no contexto da requisição.
 */

import * as db from "./db";

export interface OpeningSlot { from: string; to: string }


export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseSeals(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Cidades atendidas. O piloto é só São Carlos: densidade importa mais que
 * espalhamento — quem entra pela loja A precisa achar a B e a C perto.
 *
 * O campo era texto livre e o banco já tinha "SAO CARLOS", "SÃO CARLOS" e
 * "São Carlos" como se fossem três lugares, quebrando busca e filtro.
 */
export const SERVED_REGIONS = ["São Carlos - SP"];

function regionKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Devolve o nome canônico da cidade, ou null se ainda não atendemos. */
export function normalizeRegion(value: string): string | null {
  const key = regionKey(value);
  if (!key) return null;
  const match = SERVED_REGIONS.find((region) => {
    const full = regionKey(region);
    const city = regionKey(region.split("-")[0] ?? region);
    return key === full || key === city || key.startsWith(city);
  });
  return match ?? null;
}

/**
 * Aceita "@loja", "loja" ou o link do perfil e devolve sempre o usuário sem @.
 * Devolve null quando o texto não é um usuário possível — a tela avisa.
 */
export function normalizeInstagram(value: string): string | null | "" {
  const raw = value.trim();
  if (!raw) return "";
  const fromUrl = raw.match(/instagram\.com\/([^/?#]+)/i);
  const handle = (fromUrl?.[1] ?? raw).replace(/^@/, "").replace(/\/+$/, "").trim();
  if (!handle) return "";
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

export function slugifyStoreName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const calculate = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(value[index]) * (length + 1 - index);
    const digit = (sum * 10) % 11;
    return digit === 10 ? 0 : digit;
  };
  return calculate(9) === Number(value[9]) && calculate(10) === Number(value[10]);
}

export function normalizePixKey(value: string): string {
  const raw = value.trim();
  if (raw.includes("@")) return raw.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return raw.toLowerCase();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14) return digits;
  if (digits.length === 11 && isValidCpf(digits)) return digits;
  if (digits.length === 13 && digits.startsWith("55")) return `+${digits}`;
  if (/^[1-9]\d9\d{8}$/.test(digits)) return `+55${digits}`;
  return raw;
}

/** Horário gravado na loja: 7 posições, null quando fecha naquele dia. */
export function parseOpeningHours(raw: string | null): Array<OpeningSlot | null> {
  const empty = Array.from({ length: 7 }, () => null as OpeningSlot | null);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return empty;
    return empty.map((_, index) => {
      const entry = parsed[index];
      if (!entry || typeof entry !== "object") return null;
      const from = typeof entry.from === "string" ? entry.from : "";
      const to = typeof entry.to === "string" ? entry.to : "";
      return TIME_PATTERN.test(from) && TIME_PATTERN.test(to) ? { from, to } : null;
    });
  } catch {
    return empty;
  }
}

export function readOpeningHours(raw: unknown): { error: string } | { hours: Array<OpeningSlot | null> } {
  if (raw === null || raw === undefined) return { hours: Array.from({ length: 7 }, () => null) };
  if (!Array.isArray(raw) || raw.length !== 7) return { error: "Informe os sete dias da semana." };
  const hours: Array<OpeningSlot | null> = [];
  for (let index = 0; index < 7; index++) {
    const entry = raw[index] as { from?: unknown; to?: unknown } | null;
    if (!entry || typeof entry !== "object") { hours.push(null); continue; }
    const from = typeof entry.from === "string" ? entry.from.trim() : "";
    const to = typeof entry.to === "string" ? entry.to.trim() : "";
    if (!from && !to) { hours.push(null); continue; }
    if (!TIME_PATTERN.test(from) || !TIME_PATTERN.test(to)) return { error: `Revise o horário de ${WEEKDAY_LABELS[index]} (use 08:00).` };
    if (from >= to) return { error: `Em ${WEEKDAY_LABELS[index]}, o fechamento precisa ser depois da abertura.` };
    hours.push({ from, to });
  }
  return { hours };
}

/** Agora no fuso de Brasília, independente de onde o Worker rodar. */
export function nowInBrazil(): { weekday: number; time: string } {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const shortDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const weekday = shortDays.indexOf(value("weekday").toLowerCase().slice(0, 3));
  return { weekday: weekday < 0 ? new Date().getUTCDay() : weekday, time: `${value("hour")}:${value("minute")}` };
}

export function openingStatus(raw: string | null) {
  const hours = parseOpeningHours(raw);
  const configured = hours.some(Boolean);
  if (!configured) return { openingHours: hours, hoursConfigured: false, openNow: null, todayLabel: null as string | null };
  const { weekday, time } = nowInBrazil();
  const today = hours[weekday] ?? null;
  const openNow = Boolean(today && time >= today.from && time < today.to);
  return {
    openingHours: hours,
    hoursConfigured: true,
    openNow,
    todayLabel: today ? `Hoje das ${today.from} às ${today.to}` : "Fechado hoje",
  };
}

export function parseImageUrls(raw: string | null, fallback: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      const urls = parsed.filter((url): url is string => typeof url === "string" && url.startsWith("https://"));
      if (urls.length) return urls.slice(0, 5);
    }
  } catch {}
  return fallback ? [fallback] : [];
}

/** Faixas de frete gravadas no produto. Retorna [] quando o produto usa o valor único antigo. */
export function parseShippingTiers(raw: string | null): db.ShippingTier[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((tier): tier is db.ShippingTier => Boolean(tier) && typeof tier === "object")
      .map((tier) => ({
        upToKm: typeof tier.upToKm === "number" ? tier.upToKm : null,
        feeCents: typeof tier.feeCents === "number" ? tier.feeCents : null,
        label: typeof tier.label === "string" && tier.label.trim() ? tier.label.trim() : null,
      }));
  } catch {
    return [];
  }
}

/** Converte as faixas vindas do formulário, devolvendo a mensagem de erro quando algo não fecha. */
export function readShippingTiers(raw: unknown): { error: string } | { tiers: db.ShippingTier[] } {
  if (raw === null || raw === undefined) return { tiers: [] };
  if (!Array.isArray(raw)) return { error: "Revise as faixas de frete." };
  if (raw.length > 4) return { error: "Use no máximo 4 faixas de frete." };
  const tiers: db.ShippingTier[] = [];
  let previousKm = 0;
  for (let index = 0; index < raw.length; index++) {
    const entry = raw[index] as { upToKm?: unknown; feeCents?: unknown; label?: unknown };
    if (!entry || typeof entry !== "object") return { error: "Revise as faixas de frete." };
    const isLast = index === raw.length - 1;
    // Faixa descrita em palavras ("Centro e Vila Nery", "R$ 1,00 por km rodado").
    const label = typeof entry.label === "string" ? entry.label.trim().replace(/\s+/g, " ") : "";
    if (label.length > 80) return { error: "A descrição de uma faixa de frete pode ter no máximo 80 caracteres." };
    const rawKm = entry.upToKm;
    const upToKm = rawKm === null || rawKm === undefined || rawKm === "" ? null : Number(rawKm);
    // A ordem por quilometragem só vale entre faixas numéricas. Uma faixa escrita
    // em palavras não tem "até onde vai", então fica fora dessas duas regras.
    if (!label) {
      if (upToKm === null && !isLast) return { error: "Só a última faixa pode ser \"acima de\"." };
      if (upToKm !== null) {
        // Sem teto de distância: só exigimos que cada faixa comece onde a anterior terminou.
        if (!Number.isFinite(upToKm) || upToKm <= previousKm) return { error: `A faixa ${index + 1} precisa ter uma distância maior que a anterior (${previousKm} km).` };
        previousKm = upToKm;
      }
    } else if (upToKm !== null && (!Number.isFinite(upToKm) || upToKm <= 0)) {
      return { error: `Revise a distância da faixa ${index + 1}.` };
    }
    const rawFee = entry.feeCents;
    const feeCents = rawFee === null || rawFee === undefined || rawFee === "" ? null : Math.round(Number(rawFee));
    if (feeCents !== null && (!Number.isFinite(feeCents) || feeCents < 0)) return { error: "Revise o valor de uma das faixas de frete." };
    tiers.push({ upToKm, feeCents, label: label || null });
  }
  return { tiers };
}

/**
 * Conteúdo da venda: quanto vem em cada unidade vendida. Fica vazio quando a
 * loja não informa — é melhor não dizer nada do que exibir um chute.
 */
export const CONTENT_UNITS = new Map<string, string>([
  ["g", "g"],
  ["kg", "kg"],
  ["ml", "ml"],
  ["l", "L"],
  ["un", "un"],
]);

export function readContent(rawAmount: unknown, rawUnit: unknown): { error: string } | { amount: number | null; unit: string | null } {
  const unit = typeof rawUnit === "string" ? rawUnit.trim().toLowerCase() : "";
  const vazio = rawAmount === null || rawAmount === undefined || rawAmount === "";
  if (vazio && !unit) return { amount: null, unit: null };
  const amount = Number(rawAmount);
  if (vazio || !Number.isFinite(amount) || amount <= 0) return { error: "Informe quanto vem em cada venda, ou deixe o campo vazio." };
  if (amount > 100_000) return { error: "Revise o conteúdo do produto." };
  if (!CONTENT_UNITS.has(unit)) return { error: "Escolha uma medida válida para o conteúdo (g, kg, ml, L ou un)." };
  // Duas casas bastam para 0,75 kg e 1,5 L; mais que isso é ruído no anúncio.
  return { amount: Math.round(amount * 100) / 100, unit };
}

/**
 * "500 ml", "1,5 kg", "30 unidades" — o texto que o comprador lê.
 *
 * Em unidades a abreviação "un" colada no preço ("R$ 20,00/bandeja · 30 un")
 * era lida como "30 bandejas". Escrito por extenso, fica claro que o número é o
 * conteúdo de uma venda, não a quantidade de vendas.
 */
export function contentLabel(amount: number | null, unit: string | null): string | null {
  if (amount === null || !unit) return null;
  const medida = CONTENT_UNITS.get(unit);
  if (!medida) return null;
  const numero = String(amount).replace(".", ",");
  if (unit === "un") return amount === 1 ? "1 unidade" : `${numero} unidades`;
  return `${numero} ${medida}`;
}

/** Peso equivalente em kg, quando o conteúdo já diz isso — evita perguntar duas vezes. */
export function contentWeightKg(amount: number | null, unit: string | null): number | null {
  if (amount === null || !unit) return null;
  if (unit === "kg") return amount;
  if (unit === "g") return amount / 1000;
  // Litro de líquido alimentar fica perto de 1 kg; é a aproximação que a
  // estimativa de CO₂ já usava por padrão.
  if (unit === "l") return amount;
  if (unit === "ml") return amount / 1000;
  return null;
}

/** Menor valor cobrado entre as faixas — é o "a partir de" mostrado nas listagens. */
export function cheapestTierCents(tiers: db.ShippingTier[]): number | null {
  const fees = tiers.map((tier) => tier.feeCents).filter((fee): fee is number => fee !== null);
  return fees.length ? Math.min(...fees) : null;
}

export function validProductImages(value: unknown, fallback: unknown): string[] | null {
  const candidates = Array.isArray(value) ? value : typeof fallback === "string" ? [fallback] : [];
  const unique = [...new Set(candidates.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))];
  if (!unique.length || unique.length > 5) return null;
  try {
    unique.forEach((item) => {
      const url = new URL(item);
      if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.startsWith("/hnwixqnd/image/upload/")) throw new Error();
    });
    return unique;
  } catch {
    return null;
  }
}
