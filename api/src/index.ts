/**
 * Semeia — API do marketplace (Cloudflare Workers + D1).
 *
 * Rode `npm run cf-typegen` para gerar o tipo `Env` a partir do wrangler.jsonc.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import * as db from "./db";
import { safeEqual } from "./crypto";
import { gmailConfigured } from "./gmail";
import { AdminAlert, sendAdminAlertEmail, sendStoreApprovedEmail, sendStoreOrderEmail, sendStoreSuspendedEmail, sendStoreWelcomeEmail } from "./email";
import {
  defaultWeightKg,
  estimateLifecycleSavings,
  inferProductType,
  isDeliveryMethod,
  isPackaging,
  isProcessing,
  isProductType,
} from "./impact";
import {
  SERVED_REGIONS,
  cheapestTierCents,
  contentWeightKg,
  isValidCpf,
  normalizePixKey,
  normalizeRegion,
  openingStatus,
  parseImageUrls,
  parseProductAddons,
  parseSeals,
  parseShippingTiers,
  readContent,
  readOpeningHours,
  readProductAddons,
  readShippingTiers,
  slugifyStoreName,
  validProductImages,
} from "./parsing";
import {
  PRODUCT_CATEGORIES,
  PROMOTION_DURATION_MULTIPLIER,
  PROMOTION_FREE_DURING_PILOT,
  PROMOTION_SCOPE_MULTIPLIER,
  PROMOTION_WEEKLY_PRICES,
  promotionCharge,
} from "./pricing";
import {
  FULFILLMENT_LABELS,
  groupOrders,
  serializeOwnerStore,
  serializeProduct,
  serializePromotion,
  serializeStorePromotion,
} from "./serializers";


type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

// Acesso provisório para o piloto. Como aparece no código do painel, não é
// adequado para produção: substitua pelo ADMIN_TOKEN antes de divulgá-lo.

// ALLOWED_ORIGIN aceita vários endereços separados por vírgula. Passou a ser
// lista quando o site ganhou domínio próprio: durante a virada o semeiabr.com e
// o endereço antigo do Pages precisam funcionar ao mesmo tempo, senão um dos
// dois fica sem conseguir falar com a API.
app.use("/api/*", (c, next) =>
  cors({
    origin: (requestOrigin) => {
      const allowedOrigins = new Set([
        ...(c.env.ALLOWED_ORIGIN ?? "").split(",").map((endereco) => endereco.trim()).filter(Boolean),
        "http://localhost:8744",
        "http://127.0.0.1:8744",
      ]);
      return allowedOrigins.has(requestOrigin) ? requestOrigin : undefined;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type", "authorization"],
    maxAge: 86400,
  })(c, next),
);

app.onError((err, c) => {
  // Toda resposta de erro da API sai como JSON, incluindo as lançadas com HTTPException.
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(
    JSON.stringify({
      level: "error",
      path: new URL(c.req.url).pathname,
      method: c.req.method,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  return c.json({ error: "Erro interno. Tente novamente em instantes." }, 500);
});

app.notFound((c) => c.json({ error: "Rota não encontrada." }, 404));

// ---------------------------------------------------------------- helpers ---



async function uniqueStoreSlug(database: D1Database, name: string, excludeId?: string): Promise<string> {
  const base = slugifyStoreName(name) || "loja";
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await db.getStoreBySlug(database, candidate);
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

// Lojas criadas antes do slug existir ganham um na primeira consulta.
async function ensureStoreSlug(database: D1Database, store: db.StoreRow): Promise<string> {
  if (store.slug) return store.slug;
  const slug = await uniqueStoreSlug(database, store.name, store.id);
  await db.setStoreSlug(database, store.id, slug);
  store.slug = slug;
  return slug;
}














interface FirebaseLookupResponse {
  users?: Array<{ email?: string; emailVerified?: boolean }>;
}

/**
 * Trilha do piloto: uma linha JSON por acontecimento que mexe em estoque,
 * pedido ou catálogo. Serve para acompanhar o fluxo real por `wrangler tail`
 * (ou pelos logs do painel da Cloudflare) sem precisar consultar o banco.
 *
 * Só id e número entram aqui — nome e telefone do comprador ficam de fora.
 */
function trilha(event: string, dados: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", event, ...dados }));
}

async function firebaseVerifiedEmail(env: Env, rawToken: unknown): Promise<string | null> {
  const idToken = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!idToken || idToken.length > 12_000) return null;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) },
  );
  if (!response.ok) return null;
  const data = await response.json<FirebaseLookupResponse>();
  const user = data.users?.[0];
  return user?.email && user.emailVerified ? user.email.trim().toLowerCase() : null;
}

async function storeFromLogin(
  env: Env,
  body: { idToken?: unknown },
): Promise<db.StoreRow | null> {
  const firebaseEmail = await firebaseVerifiedEmail(env, body.idToken);
  return firebaseEmail ? db.getStoreByEmail(env.DB, firebaseEmail) : null;
}

function rateKey(c: { req: { header(name: string): string | undefined } }, scope: string): string {
  return `${scope}:${c.req.header("cf-connecting-ip") ?? "unknown"}`;
}

async function allowedBy(limiter: RateLimit, c: { req: { header(name: string): string | undefined } }, scope: string): Promise<boolean> {
  return (await limiter.limit({ key: rateKey(c, scope) })).success;
}







// ------------------------------------------------------------ rotas públicas ---

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    databaseConfigured: Boolean(c.env.DB),
    // Sem isto, o vendedor deixa de receber aviso de pedido sem ninguém notar.
    emailConfigured: gmailConfigured(c.env),
    paymentMode: "direct_contact",
  }),
);

app.get("/api/products", async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(48, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "24", 10) || 24));
  const products = await db.listProducts(c.env.DB, {
    search: url.searchParams.get("q") ?? undefined,
    categories: url.searchParams.getAll("cat"),
    seals: url.searchParams.getAll("seal"),
    region: url.searchParams.get("region") ?? undefined,
    limit,
    offset: (page - 1) * limit,
  });
  const hasMore = products.length > limit;
  // Reservas de outros compradores aparecem junto do estoque na vitrine.
  const reserved = await db.getReservedUnits(c.env.DB);
  const response = c.json({ products: products.slice(0, limit).map((product) => serializeProduct(product, reserved.get(product.id) ?? 0)), pagination: { page, limit, hasMore, nextPage: hasMore ? page + 1 : null } });
  response.headers.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  return response;
});

app.get("/api/products/:id", async (c) => {
  const product = await db.getProduct(c.env.DB, c.req.param("id"));
  if (!product) return c.json({ error: "Produto não encontrado." }, 404);
  const reserved = await db.getReservedUnits(c.env.DB, product.store_id);
  return c.json({ product: serializeProduct(product, reserved.get(product.id) ?? 0) });
});

app.get("/api/impact", async (c) => {
  const totals = await db.getImpactTotals(c.env.DB);
  return c.json({
    co2Kg: Math.round(totals.co2_g / 1000),
    stores: totals.stores,
    products: totals.products,
  });
});

interface DirectImpactBody {
  eventId?: unknown;
  productId?: unknown;
  items?: unknown;
  fulfillmentMethod?: unknown;
  shippingTierIndex?: unknown;
  buyerName?: unknown;
  buyerWhatsapp?: unknown;
}


/** Itens de um pedido: `items` do carrinho ou o `productId` avulso do "comprar agora". */
function readOrderItems(body: DirectImpactBody): { error: string } | { items: { productId: string; quantity: number; addonIds: string[] }[] } {
  if (body.items === undefined || body.items === null) {
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId || productId.length > 160) return { error: "Revise o produto do pedido." };
    return { items: [{ productId, quantity: 1, addonIds: [] }] };
  }
  if (!Array.isArray(body.items) || !body.items.length) return { error: "Seu pedido está vazio." };
  if (body.items.length > 30) return { error: "Use no máximo 30 itens por pedido." };
  const items: { productId: string; quantity: number; addonIds: string[] }[] = [];
  for (const entry of body.items as { productId?: unknown; quantity?: unknown; addonIds?: unknown }[]) {
    if (!entry || typeof entry !== "object") return { error: "Revise os itens do pedido." };
    const productId = typeof entry.productId === "string" ? entry.productId.trim() : "";
    const quantity = Math.round(Number(entry.quantity));
    if (!productId || productId.length > 160) return { error: "Revise os itens do pedido." };
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) return { error: "Revise a quantidade de um dos itens." };
    const rawAddonIds = entry.addonIds ?? [];
    if (!Array.isArray(rawAddonIds) || rawAddonIds.length > 8 || rawAddonIds.some((value) => typeof value !== "string")) return { error: "Revise os adicionais de um dos itens." };
    const addonIds = [...new Set(rawAddonIds.map((value) => String(value).trim()).filter(Boolean))];
    if (addonIds.length !== rawAddonIds.length) return { error: "Há adicionais inválidos ou repetidos no pedido." };
    if (items.some((item) => item.productId === productId)) return { error: "Há itens repetidos no pedido." };
    items.push({ productId, quantity, addonIds });
  }
  return { items };
}

const FULFILLMENT_METHODS = new Set<db.FulfillmentMethod>(["walk", "bike", "vehicle", "delivery"]);
const DELIVERY_KG_CO2E_PER_KM: Record<string, number> = {
  gasoline_car: 0.192,
  ethanol_car: 0.125,
  electric_car: 0.04,
  gasoline_motorcycle: 0.08,
  cargo_bike: 0,
};
const PUBLISHED_DELIVERY_KG_PER_ORDER: Record<string, number> = {
  pickup: 0.05,
  grouped: 0.15,
  dedicated: 1.25,
};

/** Usa o limite superior da faixa e ida + volta: uma hipótese conservadora.
 * Faixas escritas em palavras não carregam distância, então ficam sem cálculo. */
function estimatedDeliveryDistanceKm(tiers: db.ShippingTier[], index: number): number | null {
  const tier = Number.isInteger(index) && index >= 0 && index < tiers.length ? tiers[index] : null;
  if (!tier || tier.label) return null;
  if (typeof tier.upToKm === "number" && tier.upToKm > 0) return tier.upToKm;
  const previous = index > 0 ? tiers[index - 1]?.upToKm : null;
  return typeof previous === "number" && previous > 0 ? previous + 5 : null;
}

app.post("/api/impact/confirm", async (c) => {
  if (!(await allowedBy(c.env.METRIC_RATE_LIMITER, c, "impact"))) return c.json({ error: "Muitas confirmações. Aguarde um minuto." }, 429);
  const body = await c.req.json<DirectImpactBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const fulfillmentMethod = typeof body.fulfillmentMethod === "string" ? body.fulfillmentMethod : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    return c.json({ error: "Identificador da finalização inválido." }, 400);
  }
  if (!FULFILLMENT_METHODS.has(fulfillmentMethod as db.FulfillmentMethod)) {
    return c.json({ error: "Revise a forma de recebimento." }, 400);
  }
  const parsed = readOrderItems(body);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  // Nome e WhatsApp são opcionais no protocolo, mas é o que permite o vendedor
  // saber para quem entregar — o checkout do site sempre envia.
  const rawName = typeof body.buyerName === "string" ? body.buyerName.trim().slice(0, 80) : "";
  const rawPhone = typeof body.buyerWhatsapp === "string" ? body.buyerWhatsapp.replace(/\D/g, "") : "";
  if (rawName && rawName.length < 2) return c.json({ error: "Informe seu nome completo." }, 400);
  if (rawPhone && (rawPhone.length < 10 || rawPhone.length > 13)) return c.json({ error: "Revise o WhatsApp: use DDD + número." }, 400);
  const buyerName = rawName || null;
  const buyerWhatsapp = rawPhone || null;

  const products: { product: db.ProductWithStore; quantity: number; addons: db.ProductAddon[] }[] = [];
  for (const item of parsed.items) {
    const product = await db.getProduct(c.env.DB, item.productId);
    if (!product) return c.json({ error: "Produto não encontrado." }, 404);
    const available = parseProductAddons(product.addons);
    const addons = item.addonIds.map((addonId) => available.find((addon) => addon.id === addonId)).filter((addon): addon is db.ProductAddon => Boolean(addon));
    if (addons.length !== item.addonIds.length) return c.json({ error: "Um dos adicionais escolhidos não está mais disponível." }, 409);
    products.push({ product, quantity: item.quantity, addons });
  }
  // Um pedido é sempre de uma loja só: o Pix vai direto para a chave dela.
  const first = products[0];
  if (!first) return c.json({ error: "Seu pedido está vazio." }, 400);
  const storeId = first.product.store_id;
  if (products.some((entry) => entry.product.store_id !== storeId)) {
    return c.json({ error: "Cada pedido precisa ser de uma loja só." }, 400);
  }

  // O frete é cobrado uma vez por pedido, pela tabela do item com a faixa mais cara.
  const tierIndex = Number(body.shippingTierIndex);
  const feeCandidates = products.map((entry) => {
    const tiers = parseShippingTiers(entry.product.shipping_tiers);
    if (!tiers.length) return entry.product.shipping_fee_cents;
    const chosen = Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < tiers.length ? tiers[tierIndex] : null;
    return chosen ? chosen.feeCents : null;
  });
  const deliveryFeeCents = feeCandidates.includes(null)
    ? null
    : Math.max(...feeCandidates.map((fee) => fee ?? 0));
  const shippingFeeCents = fulfillmentMethod === "delivery" ? deliveryFeeCents : 0;
  const distanceKm = fulfillmentMethod === "delivery"
    ? estimatedDeliveryDistanceKm(parseShippingTiers(first.product.shipping_tiers), tierIndex)
    : 0;
  const deliveryFactor = Math.max(...products.map((entry) =>
    DELIVERY_KG_CO2E_PER_KM[entry.product.delivery_vehicle] ?? DELIVERY_KG_CO2E_PER_KM.gasoline_car ?? 0.192));
  const deliveryEmissionG = distanceKm === null ? 0 : Math.round(distanceKm * 2 * deliveryFactor * 1000);
  // Só substituímos a hipótese genérica publicada quando conhecemos a última
  // etapa: a pé/bicicleta é zero; frete usa distância + veículo do vendedor.
  // Na retirada em veículo do comprador, o combustível é desconhecido.
  const replacesPublishedDelivery = fulfillmentMethod === "walk"
    || fulfillmentMethod === "bike"
    || (fulfillmentMethod === "delivery" && distanceKm !== null);

  // Estoque é segurado quando o pedido nasce, não quando o vendedor confirma:
  // sem isso, dois compradores fecham a mesma última unidade. Recarregar a
  // página não segura de novo — o pedido já existe e nada muda.
  const already = await db.listItemsOfOrder(c.env.DB, eventId, storeId);
  if (!already.length) {
    const short = products.find((entry) =>
      entry.product.stock_quantity != null && entry.product.stock_quantity < entry.quantity);
    if (short) {
      trilha("estoque_insuficiente", {
        orderId: eventId,
        storeId,
        productId: short.product.id,
        pedido: short.quantity,
        disponivel: short.product.stock_quantity,
        motivo: "pre-checagem",
      });
      return c.json({
        error: short.product.stock_quantity
          ? `Restam só ${short.product.stock_quantity} de ${short.product.name}. Ajuste a quantidade na sacola.`
          : `${short.product.name} ficou sem estoque. Retire da sacola para continuar.`,
      }, 409);
    }
    const held = await db.holdStockForOrder(c.env.DB, {
      orderId: eventId,
      storeId,
      items: products.map((entry) => ({
        productId: entry.product.id,
        quantity: entry.quantity,
        controlled: entry.product.stock_quantity != null,
      })),
    });
    trilha(held.ok ? "estoque_reservado" : "estoque_insuficiente", {
      orderId: eventId,
      storeId,
      itens: products.map((entry) => ({
        productId: entry.product.id,
        quantidade: entry.quantity,
        estoqueAntes: entry.product.stock_quantity,
      })),
      ...(held.ok ? {} : { productId: held.productId }),
    });
    if (!held.ok) {
      const lost = products.find((entry) => entry.product.id === held.productId);
      return c.json({
        error: `Alguém acabou de levar as últimas unidades de ${lost ? lost.product.name : "um item"}. Nada foi cobrado — revise sua sacola.`,
      }, 409);
    }
  }

  let created = false;
  let productAmountCents = 0;
  let co2g = 0;
  let remainingDeliveryEmissionG = replacesPublishedDelivery ? deliveryEmissionG : 0;
  for (const [index, entry] of products.entries()) {
    const { product, quantity, addons } = entry;
    const amountCents = (product.price_cents + addons.reduce((sum, addon) => sum + addon.priceCents, 0)) * quantity;
    // `co2_g` já descontava uma entrega genérica no anúncio. Quando podemos
    // substituí-la, somamos a hipótese antiga de volta e descontamos a rota real.
    const publishedDeliveryG = Math.round((PUBLISHED_DELIVERY_KG_PER_ORDER[product.delivery_method] ?? 0.05) * 1000);
    const grossItemCo2g = (Math.max(0, product.co2_g) + (replacesPublishedDelivery ? publishedDeliveryG : 0)) * quantity;
    const itemCo2g = Math.max(0, grossItemCo2g - remainingDeliveryEmissionG);
    remainingDeliveryEmissionG = Math.max(0, remainingDeliveryEmissionG - grossItemCo2g);
    productAmountCents += amountCents;
    co2g += itemCo2g;
    const inserted = await db.insertDirectPurchaseConfirmation(c.env.DB, {
      // Uma linha por item, derivada do mesmo eventId: recarregar a página não duplica métrica.
      id: products.length === 1 ? eventId : `${eventId}:${index}`,
      orderId: eventId,
      productId: product.id,
      storeId,
      fulfillmentMethod: fulfillmentMethod as db.FulfillmentMethod,
      productAmountCents: amountCents,
      // O frete inteiro fica no primeiro item para não somar duas vezes no total da loja.
      shippingFeeCents: index === 0 ? shippingFeeCents : 0,
      co2g: itemCo2g,
      quantity,
      buyerName,
      buyerWhatsapp,
      selectedAddons: addons,
    });
    if (inserted) created = true;
  }

  // O e-mail não pode atrasar nem derrubar a confirmação do comprador.
  if (created) {
    const store = await db.getStore(c.env.DB, storeId);
    if (store) {
      const notify = sendStoreOrderEmail(c.env, {
        id: store.id, name: store.name, contactName: store.contact_name, email: store.email, slug: store.slug,
      }, {
        buyerName,
        buyerWhatsapp,
        fulfillmentLabel: FULFILLMENT_LABELS[fulfillmentMethod] ?? fulfillmentMethod,
        items: products.map(({ product, quantity, addons }) => ({ name: product.name + (addons.length ? ` (+ ${addons.map((addon) => addon.name).join(", ")})` : ""), quantity, amount: (product.price_cents + addons.reduce((sum, addon) => sum + addon.priceCents, 0)) * quantity / 100 })),
        shippingFee: shippingFeeCents === null ? null : shippingFeeCents / 100,
        total: shippingFeeCents === null ? null : (productAmountCents + shippingFeeCents) / 100,
      });
      if (c.executionCtx) c.executionCtx.waitUntil(trackEmail(c.env, "store_order", store, notify));
    }
  }

  trilha("pedido_criado", {
    orderId: eventId,
    storeId,
    novo: created,
    itens: products.length,
    unidades: products.reduce((soma, entry) => soma + entry.quantity, 0),
    produtoCentavos: productAmountCents,
    freteCentavos: shippingFeeCents,
    emissaoEntregaG: distanceKm === null ? null : deliveryEmissionG,
    distanciaEntregaKm: distanceKm,
    recebimento: fulfillmentMethod,
  });
  return c.json({
    ok: true,
    created,
    co2Kg: co2g / 1000,
    productAmount: productAmountCents / 100,
    shippingFee: shippingFeeCents === null ? null : shippingFeeCents / 100,
    deliveryEmissionKg: distanceKm === null ? null : deliveryEmissionG / 1000,
    total: shippingFeeCents === null ? null : (productAmountCents + shippingFeeCents) / 100,
    metricNotice: "Compra informada pelo comprador e adicionada às métricas comunitárias.",
  }, created ? 201 : 200);
});

app.get("/api/stores", async (c) => {
  const stores = await db.listPublicStores(c.env.DB);
  return c.json({
    stores: stores.map((store) => ({
      id: store.id,
      slug: store.slug,
      name: store.name,
      region: store.region,
      category: store.category,
      logoUrl: store.logo_url,
      description: store.description,
      ...openingStatus(store.opening_hours),
    })),
  });
});

app.get("/api/stores/featured", async (c) => {
  const featured = await db.listFeaturedStores(c.env.DB);
  return c.json({
    stores: featured.map(({ position, placementScope, placementCategory, store }) => ({
      id: store.id,
      slug: store.slug,
      name: store.name,
      region: store.region,
      category: store.category,
      logoUrl: store.logo_url,
      description: store.description,
      ...openingStatus(store.opening_hours),
      sponsored: true,
      // Mesmos campos do produto patrocinado, para o catálogo tratar os dois igual.
      sponsoredPosition: placementScope === "category" ? null : position,
      sponsoredCategoryPosition: placementScope === "home" ? null : position,
      sponsoredCategory: placementScope === "home" ? null : placementCategory,
    })),
  });
});

app.get("/api/stores/:id", async (c) => {
  // Aceita tanto o id interno quanto o slug público (/loja/<slug>).
  const ref = c.req.param("id");
  const store = (await db.getStore(c.env.DB, ref)) ?? (await db.getStoreBySlug(c.env.DB, ref.toLowerCase()));
  if (!store || store.status !== "approved") return c.json({ error: "Loja não encontrada." }, 404);
  const slug = await ensureStoreSlug(c.env.DB, store);
  const products = await db.listPublicProductsForStore(c.env.DB, store.id);
  const reserved = await db.getReservedUnits(c.env.DB, store.id);
  return c.json({
    store: {
      id: store.id, slug, name: store.name, region: store.region, category: store.category,
      seals: parseSeals(store.seals), logoUrl: store.logo_url, coverUrl: store.cover_url,
      whatsapp: store.whatsapp,
      description: store.description, ...openingStatus(store.opening_hours),
    },
    products: products.map((product) => serializeProduct(product, reserved.get(product.id) ?? 0)),
  });
});

interface StoreSignupBody {
  name?: unknown;
  contactName?: unknown;
  email?: unknown;
  whatsapp?: unknown;
  category?: unknown;
  region?: unknown;
  seals?: unknown;
  idToken?: unknown;
  pixKey?: unknown;
  pixName?: unknown;
  pixCity?: unknown;
}

app.post("/api/stores", async (c) => {
  if (!(await allowedBy(c.env.REGISTRATION_RATE_LIMITER, c, "store-signup"))) return c.json({ error: "Muitas tentativas de cadastro. Aguarde um minuto." }, 429);
  const body = await c.req.json<StoreSignupBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo da requisição inválido." }, 400);

  const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const name = text(body.name);
  const contactName = text(body.contactName);
  const email = text(body.email);
  const category = text(body.category);
  const region = text(body.region);
  const pixKey = normalizePixKey(text(body.pixKey));
  const pixName = text(body.pixName);
  const pixCity = text(body.pixCity);

  const missing = { name, contactName, email, category, region };
  const emptyField = Object.entries(missing).find(([, value]) => value.length === 0);
  if (emptyField) {
    return c.json({ error: `Campo obrigatório faltando: ${emptyField[0]}.` }, 400);
  }
  // Cidade entra sempre no mesmo formato: era texto livre e virou três "cidades".
  const servedRegion = normalizeRegion(region);
  if (!servedRegion) {
    return c.json({
      error: `O Semeia começou por ${SERVED_REGIONS.join(", ")}. Fale com a gente pelo WhatsApp (16) 99439-2545 para abrirmos a sua cidade.`,
    }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json({ error: "E-mail inválido." }, 400);
  }
  const verifiedEmail = await firebaseVerifiedEmail(c.env, body.idToken);
  if (!verifiedEmail || verifiedEmail !== email.toLowerCase()) return c.json({ error: "Entre com o Google usando o mesmo e-mail informado no cadastro." }, 401);
  const seals = Array.isArray(body.seals)
    ? body.seals.filter((s): s is string => typeof s === "string")
    : [];

  const id = crypto.randomUUID();
  const slug = await uniqueStoreSlug(c.env.DB, name);
  await db.insertStore(c.env.DB, {
    id,
    slug,
    name,
    contactName,
    email,
    whatsapp: text(body.whatsapp) || null,
    paymentLink: null,
    category,
    region: servedRegion,
    seals,
    ownerPasswordHash: null,
    pixKey: pixKey || null,
    pixName: pixName || null,
    pixCity: pixCity || null,
  });

  // Os e-mails saem depois da resposta: o lojista não espera pelo servidor de e-mail.
  c.executionCtx.waitUntil(
    trackEmail(c.env, "store_welcome", { id, email }, sendStoreWelcomeEmail(c.env, { id, name, contactName, email, slug })),
  );
  c.executionCtx.waitUntil(notifyAdmin(c.env, id, {
    tipo: "loja_pendente",
    storeName: name,
    contactName,
    storeEmail: email,
    whatsapp: text(body.whatsapp) || null,
    region: servedRegion,
    categoryLabel: category,
  }));

  return c.json({
    storeId: id,
    status: "pending",
    message: "Cadastro recebido. Vamos revisar as informações antes de publicar a loja.",
  }, 201);
});

// Rotas antigas permanecem com resposta explícita para links já compartilhados.
interface StoreProductBody {
  id?: unknown; name?: unknown; description?: unknown;
  priceCents?: unknown; unit?: unknown; category?: unknown; seals?: unknown; co2g?: unknown; imageUrl?: unknown; imageUrls?: unknown; idToken?: unknown;
  productType?: unknown; weightKg?: unknown; processing?: unknown; packaging?: unknown;
  refrigerated?: unknown; deliveryMethod?: unknown; pesticideFree?: unknown;
  deliveryVehicle?: unknown;
  stockQuantity?: unknown; shippingFeeCents?: unknown; shippingTiers?: unknown; pickupAddress?: unknown;
  contentAmount?: unknown; contentUnit?: unknown;
  addons?: unknown;
}

interface StoreLoginBody { idToken?: unknown; }

app.post("/api/store/me", async (c) => {
  const body = await c.req.json<StoreLoginBody>().catch(() => null);
  const store = body ? await storeFromLogin(c.env, body) : null;
  if (!store) return c.json({ error: "E-mail, senha ou conta Google não conferem com uma loja." }, 401);
  await ensureStoreSlug(c.env.DB, store);
  const products = await db.listProductsForStore(c.env.DB, store.id);
  const promotions = await db.listPromotionsForStore(c.env.DB, store.id);
  const views = await db.getViewsForStore(c.env.DB, store.id);
  const confirmed = await db.getConfirmedStatsForStore(c.env.DB, store.id);
  const monthly = await db.getCurrentMonthMetricsForStore(c.env.DB, store.id);
    const storePromotions = await db.listStorePromotionsForStore(c.env.DB, store.id);
  const orderItems = await db.listOrderItemsForStore(c.env.DB, store.id);
  const orderStates = await db.listOrderStatesForStore(c.env.DB, store.id);
  const sales = await db.getSellerConfirmedSales(c.env.DB, store.id);
  const reserved = await db.getReservedUnits(c.env.DB, store.id);
  trilha("painel_aberto", {
    storeId: store.id,
    status: store.status,
    produtos: products.length,
    pedidos: orderItems.length,
    visitasMes: monthly.totalViews,
    visualizacoesMes: monthly.productViews,
    cliquesWhatsMes: monthly.whatsappClicks,
  });
  return c.json({
    ...serializeOwnerStore(store, products, views, confirmed, monthly, reserved),
    promotions: promotions.map(serializePromotion),
    storePromotions: storePromotions.map(serializeStorePromotion),
    orders: groupOrders(orderItems, orderStates),
    sales: {
      totals: {
        orders: sales.totals.orders,
        delivered: sales.totals.delivered,
        units: sales.totals.units,
        revenue: sales.totals.revenueCents / 100,
      },
      byProduct: sales.byProduct.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        orders: row.orders,
        units: row.units,
        revenue: row.revenueCents / 100,
        lastAt: row.lastAt,
      })),
    },
  });
});

interface StoreMetricBody { eventType?: unknown; storeId?: unknown; productId?: unknown; clientId?: unknown; }

app.post("/api/metrics", async (c) => {
  if (!(await allowedBy(c.env.METRIC_RATE_LIMITER, c, "store-metric"))) return c.json({ ok: false }, 429);
  const body = await c.req.json<StoreMetricBody>().catch(() => null);
  const eventType = body?.eventType;
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  const storeId = typeof body?.storeId === "string" ? body.storeId.trim() : "";
  if ((eventType !== "store_view" && eventType !== "product_view" && eventType !== "whatsapp_click") || !/^[a-zA-Z0-9_-]{16,96}$/.test(clientId)) {
    return c.json({ error: "Métrica inválida." }, 400);
  }

  if (eventType === "store_view") {
    const store = storeId ? await db.getStore(c.env.DB, storeId) : null;
    if (!store || store.status !== "approved") return c.json({ error: "Loja não encontrada." }, 404);
    return c.json({ ok: await db.recordStoreMetric(c.env.DB, { storeId: store.id, type: eventType, clientId }) });
  }

  const product = productId ? await db.getProduct(c.env.DB, productId) : null;
  if (!product) return c.json({ error: "Produto não encontrado." }, 404);
  const created = await db.recordStoreMetric(c.env.DB, { storeId: product.store_id, productId: product.id, type: eventType, clientId });
  if (created && eventType === "product_view") await db.registerProductView(c.env.DB, product.id);
  return c.json({ ok: created });
});

// Contador de visualizações simples, usado só para as métricas do painel da loja.
app.post("/api/products/:id/view", async (c) => {
  if (!(await allowedBy(c.env.METRIC_RATE_LIMITER, c, "product-view"))) return c.json({ ok: false }, 429);
  const productId = c.req.param("id");
  if (!productId || productId.length > 160 || !(await db.productIdExists(c.env.DB, productId))) {
    return c.json({ error: "Produto não encontrado." }, 404);
  }
  await db.registerProductView(c.env.DB, productId);
  return c.json({ ok: true });
});

app.get("/api/promotions/prices", (c) => c.json({
  // No piloto o destaque é cortesia: weeklyPrice sai zerado e o preço cheio
  // viaja em tablePrice, para a tela poder mostrar o valor de tabela riscado.
  free: PROMOTION_FREE_DURING_PILOT,
  positions: [...PROMOTION_WEEKLY_PRICES].map(([position, weeklyPriceCents]) => ({
    position,
    weeklyPrice: PROMOTION_FREE_DURING_PILOT ? 0 : weeklyPriceCents / 100,
    tablePrice: weeklyPriceCents / 100,
  })),
  durations: [...PROMOTION_DURATION_MULTIPLIER.keys()],
  scopes: [...PROMOTION_SCOPE_MULTIPLIER].map(([scope, multiplier]) => ({ scope, multiplier })),
}));

app.post("/api/store/promotions/availability", async (c) => {
  const body = await c.req.json<StoreLoginBody & { placementScope?: unknown; placementCategory?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para consultar as posições." }, 401);
  const placementScope = typeof body.placementScope === "string" && PROMOTION_SCOPE_MULTIPLIER.has(body.placementScope)
    ? body.placementScope as "home" | "both" | "category"
    : "home";
  const rawCategory = typeof body.placementCategory === "string" ? body.placementCategory.trim() : "";
  const placementCategory = placementScope === "home" ? null : rawCategory;
  if (placementScope !== "home" && (!placementCategory || !PRODUCT_CATEGORIES.has(placementCategory))) {
    return c.json({ error: "Escolha uma categoria válida para consultar as posições." }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const positions = await db.promotionAvailability(c.env.DB, placementScope, placementCategory);
  return c.json({
    now,
    positions: positions.map((slot) => ({
      position: slot.position,
      availableNow: !slot.occupiedUntil || slot.occupiedUntil <= now,
      availableAt: slot.occupiedUntil,
      daysUntil: slot.occupiedUntil && slot.occupiedUntil > now ? Math.max(1, Math.ceil((slot.occupiedUntil - now) / 86400)) : 0,
    })),
  });
});

app.get("/api/store-promotions/prices", (c) => c.json({
  // No piloto o destaque é cortesia: weeklyPrice sai zerado e o preço cheio
  // viaja em tablePrice, para a tela poder mostrar o valor de tabela riscado.
  free: PROMOTION_FREE_DURING_PILOT,
  positions: [...PROMOTION_WEEKLY_PRICES].map(([position, weeklyPriceCents]) => ({
    position,
    weeklyPrice: PROMOTION_FREE_DURING_PILOT ? 0 : weeklyPriceCents / 100,
    tablePrice: weeklyPriceCents / 100,
  })),
  durations: [...PROMOTION_DURATION_MULTIPLIER.keys()],
  scopes: [...PROMOTION_SCOPE_MULTIPLIER].map(([scope, multiplier]) => ({ scope, multiplier })),
}));

app.post("/api/store/store-promotions/availability", async (c) => {
  const body = await c.req.json<StoreLoginBody & { placementScope?: unknown; placementCategory?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para consultar as posições." }, 401);
  const placementScope = typeof body.placementScope === "string" && PROMOTION_SCOPE_MULTIPLIER.has(body.placementScope)
    ? body.placementScope as "home" | "both" | "category"
    : "home";
  const rawCategory = typeof body.placementCategory === "string" ? body.placementCategory.trim() : "";
  const placementCategory = placementScope === "home" ? null : rawCategory;
  if (placementScope !== "home" && (!placementCategory || !PRODUCT_CATEGORIES.has(placementCategory))) {
    return c.json({ error: "Escolha uma categoria válida para consultar as posições." }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const positions = await db.storePromotionAvailability(c.env.DB, placementScope, placementCategory);
  return c.json({
    now,
    positions: positions.map((slot) => ({
      position: slot.position,
      availableNow: !slot.occupiedUntil || slot.occupiedUntil <= now,
      availableAt: slot.occupiedUntil,
      daysUntil: slot.occupiedUntil && slot.occupiedUntil > now ? Math.max(1, Math.ceil((slot.occupiedUntil - now) / 86400)) : 0,
    })),
  });
});

/** Onde o destaque aparece, em palavras — o aviso ao admin é lido no celular. */
function placementLabel(scope: "home" | "both" | "category", category: string | null): string {
  if (scope === "home") return "Página inicial";
  const nome = category || "categoria";
  return scope === "both" ? `Página inicial e categoria ${nome}` : `Categoria ${nome}`;
}

app.post("/api/store/store-promotions", async (c) => {
  const body = await c.req.json<StoreLoginBody & { position?: unknown; durationDays?: unknown; placementScope?: unknown; placementCategory?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para destacar sua loja." }, 401);
  if (store.status !== "approved") return c.json({ error: "Sua loja precisa estar aprovada." }, 403);
  const position = Number(body.position);
  const durationDays = Number(body.durationDays);
  const placementScope = typeof body.placementScope === "string" && PROMOTION_SCOPE_MULTIPLIER.has(body.placementScope)
    ? body.placementScope as "home" | "both" | "category"
    : "home";
  const rawPlacementCategory = typeof body.placementCategory === "string" ? body.placementCategory.trim() : "";
  const placementCategory = placementScope === "home" ? null : rawPlacementCategory;
  if (placementScope !== "home" && (!placementCategory || !PRODUCT_CATEGORIES.has(placementCategory))) {
    return c.json({ error: "Escolha uma categoria válida para o destaque." }, 400);
  }
  const amountCents = promotionCharge(position, durationDays, placementScope);
  if (amountCents === null) return c.json({ error: "Escolha uma posição de 1 a 5 e um período válido." }, 400);
  const products = await db.listProductsForStore(c.env.DB, store.id);
  if (!products.some((product) => product.active)) {
    return c.json({ error: "Publique pelo menos um produto antes de destacar a loja." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const availability = await db.storePromotionAvailability(c.env.DB, placementScope, placementCategory);
  const selectedSlot = availability.find((slot) => slot.position === position);
  const expectedStartAt = selectedSlot?.occupiedUntil && selectedSlot.occupiedUntil > now ? selectedSlot.occupiedUntil : now;
  const expectedDaysUntil = Math.max(0, Math.ceil((expectedStartAt - now) / 86400));

  const id = crypto.randomUUID();
  await db.insertStorePromotion(c.env.DB, { id, storeId: store.id, position, durationDays, amountCents, placementScope, placementCategory });
  c.executionCtx.waitUntil(notifyAdmin(c.env, store.id, {
    tipo: "destaque_loja",
    storeName: store.name,
    position,
    durationDays,
    placementLabel: placementLabel(placementScope, placementCategory),
    amountCents,
  }));
  return c.json({
    promotionId: id,
    amount: amountCents / 100,
    status: "awaiting_manual_confirmation",
    expectedStartAt,
    expectedDaysUntil,
    message: expectedDaysUntil > 0
      ? `Solicitação enviada. Se aprovada agora, sua loja aparece no catálogo em ${expectedDaysUntil} ${expectedDaysUntil === 1 ? "dia" : "dias"}, quando esta posição ficar livre.`
      : PROMOTION_FREE_DURING_PILOT
        ? "Solicitação enviada. A posição está livre e começa assim que a administração liberar — sem custo no piloto."
        : "Solicitação enviada. A posição está livre e o período começa assim que a administração confirmar o pagamento.",
  }, 201);
});

app.post("/api/store/promotions", async (c) => {
  const body = await c.req.json<StoreLoginBody & { productId?: unknown; position?: unknown; durationDays?: unknown; placementScope?: unknown; placementCategory?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para destacar um produto." }, 401);
  if (store.status !== "approved") return c.json({ error: "Sua loja precisa estar aprovada." }, 403);
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const position = Number(body.position);
  const durationDays = Number(body.durationDays);
  const placementScope = typeof body.placementScope === "string" && PROMOTION_SCOPE_MULTIPLIER.has(body.placementScope) ? body.placementScope as "home" | "both" | "category" : "home";
  const rawPlacementCategory = typeof body.placementCategory === "string" ? body.placementCategory.trim() : "";
  const placementCategory = placementScope === "home" ? null : rawPlacementCategory;
  const amountCents = promotionCharge(position, durationDays, placementScope);
  const product = productId ? await db.getProductForStore(c.env.DB, productId, store.id) : null;
  if (!product || !product.active) return c.json({ error: "Escolha um produto publicado desta loja." }, 400);
  if (placementScope !== "home" && (!placementCategory || !PRODUCT_CATEGORIES.has(placementCategory))) return c.json({ error: "Escolha uma categoria válida para o destaque." }, 400);
  if (amountCents === null) return c.json({ error: "Escolha uma posição de 1 a 5 e um período válido." }, 400);

  const now = Math.floor(Date.now() / 1000);
  const availability = await db.promotionAvailability(c.env.DB, placementScope, placementCategory);
  const selectedSlot = availability.find((slot) => slot.position === position);
  const expectedStartAt = selectedSlot?.occupiedUntil && selectedSlot.occupiedUntil > now ? selectedSlot.occupiedUntil : now;
  const expectedDaysUntil = Math.max(0, Math.ceil((expectedStartAt - now) / 86400));

  const id = crypto.randomUUID();
  await db.insertPromotion(c.env.DB, { id, productId, storeId: store.id, position, durationDays, amountCents, placementScope, placementCategory });
  c.executionCtx.waitUntil(notifyAdmin(c.env, store.id, {
    tipo: "destaque_produto",
    storeName: store.name,
    productName: product.name,
    position,
    durationDays,
    placementLabel: placementLabel(placementScope, placementCategory),
    amountCents,
  }));
  return c.json({
    promotionId: id,
    amount: amountCents / 100,
    status: "awaiting_manual_confirmation",
    expectedStartAt,
    expectedDaysUntil,
    message: expectedDaysUntil > 0
      ? `Solicitação enviada. Se aprovada agora, sua promoção começará em ${expectedDaysUntil} ${expectedDaysUntil === 1 ? "dia" : "dias"}, quando esta posição ficar livre.`
      : PROMOTION_FREE_DURING_PILOT
        ? "Solicitação enviada. A posição está livre e começa assim que a administração liberar — sem custo no piloto."
        : "Solicitação enviada. A posição está livre e o período pode começar assim que a administração confirmar o pagamento.",
  }, 201);
});

// Campos comuns ao cadastro e à edição de um anúncio. Devolve `{ error }` com a mensagem pronta
// quando algo não passa na validação, para as duas rotas responderem igual.
function parseProductFields(body: StoreProductBody): { error: string } | Omit<db.NewProduct, "id" | "storeId"> {
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const name = text(body.name), category = text(body.category);
  const priceCents = typeof body.priceCents === "number" ? Math.round(body.priceCents) : NaN;
  if (!name || !category || !Number.isFinite(priceCents) || priceCents < 0) return { error: "Revise nome, categoria e preço." };
  const imageUrls = validProductImages(body.imageUrls, body.imageUrl);
  if (!imageUrls) return { error: "Envie de 1 a 5 fotos válidas." };
  // `null` é o produto feito sob encomenda: pão, ovo do dia, marmita. Não tem
  // quantidade pronta, então também não entra na reserva de estoque — quem
  // controla a disponibilidade é o vendedor, na conversa.
  const sobEncomenda = body.stockQuantity === null;
  const stockQuantity = sobEncomenda ? null : typeof body.stockQuantity === "number" ? body.stockQuantity : Number(body.stockQuantity);
  if (!sobEncomenda && (!Number.isFinite(stockQuantity as number) || (stockQuantity as number) <= 0 || (stockQuantity as number) > 1_000_000)) {
    return { error: "Informe uma quantidade disponivel maior que zero, ou marque o produto como sob encomenda." };
  }
  const content = readContent(body.contentAmount, body.contentUnit);
  if ("error" in content) return { error: content.error };
  const parsedTiers = readShippingTiers(body.shippingTiers);
  if ("error" in parsedTiers) return { error: parsedTiers.error };
  const shippingTiers = parsedTiers.tiers;
  const parsedAddons = readProductAddons(body.addons);
  if ("error" in parsedAddons) return { error: parsedAddons.error };
  const plainFeeCents = body.shippingFeeCents === null || body.shippingFeeCents === undefined || body.shippingFeeCents === ""
    ? null
    : typeof body.shippingFeeCents === "number" ? Math.round(body.shippingFeeCents) : NaN;
  if (plainFeeCents !== null && (!Number.isFinite(plainFeeCents) || plainFeeCents < 0 || plainFeeCents > 100_000_000)) return { error: "Revise o valor do frete." };
  // Com faixas, o valor único vira o menor delas — é o que as listagens mostram como "a partir de".
  const shippingFeeCents = shippingTiers.length ? cheapestTierCents(shippingTiers) : plainFeeCents;
  const pickupAddress = text(body.pickupAddress);
  if (pickupAddress.length < 5 || pickupAddress.length > 240) return { error: "Informe um ponto de retirada valido." };
  const unit = text(body.unit) || "/un";
  const requestedType = text(body.productType);
  const productType = isProductType(requestedType) ? requestedType : inferProductType(name, category);
  const requestedWeight = typeof body.weightKg === "number" ? body.weightKg : Number(body.weightKg);
  // Ordem de preferência para o peso da estimativa de CO₂: o que o vendedor
  // digitou; o que o conteúdo já revela ("500 g" são 0,5 kg); o padrão da unidade.
  const weightKg = Number.isFinite(requestedWeight) && requestedWeight > 0 && requestedWeight <= 1000
    ? requestedWeight
    : contentWeightKg(content.amount, content.unit) ?? defaultWeightKg(unit);
  const processingRaw = text(body.processing);
  const packagingRaw = text(body.packaging);
  const deliveryRaw = text(body.deliveryMethod);
  const processing = isProcessing(processingRaw) ? processingRaw : "fresh";
  const packaging = isPackaging(packagingRaw) ? packagingRaw : "none";
  const deliveryMethod = isDeliveryMethod(deliveryRaw) ? deliveryRaw : "pickup";
  const deliveryVehicleRaw = text(body.deliveryVehicle);
  const deliveryVehicles = new Set(["gasoline_car", "ethanol_car", "electric_car", "gasoline_motorcycle", "cargo_bike"]);
  const deliveryVehicle = deliveryVehicles.has(deliveryVehicleRaw) ? deliveryVehicleRaw : "gasoline_car";
  const pesticideFree = body.pesticideFree === true;
  const refrigerated = body.refrigerated === true;
  const impact = estimateLifecycleSavings({ productType, weightKg, processing, packaging, refrigerated, deliveryMethod, pesticideFree });
  const seals = Array.isArray(body.seals) ? body.seals.filter((seal): seal is string => typeof seal === "string") : [];
  return {
    name, description: text(body.description), priceCents, unit, category, seals,
    co2g: Math.round(impact.savingsKg * 1000), imageUrl: imageUrls[0] ?? null, imageUrls, productType,
    weightKg, processing, packaging, refrigerated, deliveryMethod, deliveryVehicle, pesticideFree,
    stockQuantity, shippingFeeCents, shippingTiers, pickupAddress,
    contentAmount: content.amount, contentUnit: content.unit,
    addons: parsedAddons.addons,
  };
}

app.post("/api/store-products", async (c) => {
  if (!(await allowedBy(c.env.WRITE_RATE_LIMITER, c, "product"))) return c.json({ error: "Muitas alterações. Aguarde um minuto." }, 429);
  const body = await c.req.json<StoreProductBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "E-mail, senha ou conta Google não conferem com uma loja." }, 401);
  if (store.status !== "approved") return c.json({ error: "Sua loja ainda precisa ser aprovada." }, 403);
  const requestedId = typeof body.id === "string" ? body.id.trim() : "";
  if (!requestedId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedId)) return c.json({ error: "Revise o identificador do produto." }, 400);
  const fields = parseProductFields({
    ...body,
    deliveryVehicle: body.deliveryVehicle ?? store.delivery_vehicle ?? "gasoline_car",
  });
  if ("error" in fields) return c.json({ error: fields.error }, 400);
  let id = requestedId;
  if (await db.productIdExists(c.env.DB, id)) id = `${requestedId}-${crypto.randomUUID().slice(0, 6)}`;
  try {
    await db.insertProduct(c.env.DB, { ...fields, id, storeId: store.id });
  } catch (error) {
    console.error("store-product-insert", error);
    return c.json({ error: "Não foi possível salvar o produto agora. Tente novamente." }, 503);
  }
  trilha("produto_publicado", {
    productId: id,
    storeId: store.id,
    precoCentavos: fields.priceCents,
    estoque: fields.stockQuantity,
    fotos: fields.imageUrls?.length ?? 0,
  });
  return c.json({ ok: true, productId: id }, 201);
});

app.post("/api/store-products/:id/detail", async (c) => {
  const body = await c.req.json<StoreLoginBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para editar o anúncio." }, 401);
  const product = await db.getProductForStore(c.env.DB, c.req.param("id"), store.id);
  if (!product) return c.json({ error: "Produto não encontrado nesta loja." }, 404);
  return c.json({
    product: {
      id: product.id, name: product.name, description: product.description,
      priceCents: product.price_cents, unit: product.unit, category: product.category,
      imageUrls: parseImageUrls(product.image_urls, product.image_url),
      productType: product.product_type, weightKg: product.weight_kg,
      processing: product.processing, packaging: product.packaging,
      refrigerated: Boolean(product.refrigerated), deliveryMethod: product.delivery_method,
      deliveryVehicle: product.delivery_vehicle,
      pesticideFree: Boolean(product.pesticide_free), stockQuantity: product.stock_quantity,
      shippingFeeCents: product.shipping_fee_cents, shippingTiers: parseShippingTiers(product.shipping_tiers),
      pickupAddress: product.pickup_address,
      contentAmount: product.content_amount, contentUnit: product.content_unit,
      addons: parseProductAddons(product.addons),
    },
  });
});

app.post("/api/store-products/:id/update", async (c) => {
  if (!(await allowedBy(c.env.WRITE_RATE_LIMITER, c, "product"))) return c.json({ error: "Muitas alterações. Aguarde um minuto." }, 429);
  const body = await c.req.json<StoreProductBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para editar o anúncio." }, 401);
  if (store.status !== "approved") return c.json({ error: "Sua loja ainda precisa ser aprovada." }, 403);
  const product = await db.getProductForStore(c.env.DB, c.req.param("id"), store.id);
  if (!product) return c.json({ error: "Produto não encontrado nesta loja." }, 404);
  const fields = parseProductFields(body);
  if ("error" in fields) return c.json({ error: fields.error }, 400);
  try {
    const updated = await db.updateProduct(c.env.DB, { ...fields, id: product.id, storeId: store.id });
    if (!updated) return c.json({ error: "Produto não encontrado nesta loja." }, 404);
  } catch (error) {
    console.error("store-product-update", error);
    return c.json({ error: "Não foi possível salvar as alterações agora. Tente novamente." }, 503);
  }
  trilha("produto_atualizado", {
    productId: product.id,
    storeId: store.id,
    precoAntes: product.price_cents,
    precoDepois: fields.priceCents,
    estoqueAntes: product.stock_quantity,
    estoqueDepois: fields.stockQuantity,
  });
  return c.json({ ok: true, productId: product.id, message: "Anúncio atualizado." });
});

app.post("/api/store-products/:id/stock", async (c) => {
  if (!(await allowedBy(c.env.WRITE_RATE_LIMITER, c, "product"))) return c.json({ error: "Muitas alterações. Aguarde um minuto." }, 429);
  const body = await c.req.json<{ idToken?: unknown; delta?: unknown; quantity?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para mexer no estoque." }, 401);
  const product = await db.getProductForStore(c.env.DB, c.req.param("id"), store.id);
  if (!product) return c.json({ error: "Produto não encontrado nesta loja." }, 404);

  const delta = Number(body.delta);
  const quantity = Number(body.quantity);
  // `quantity: null` volta o produto para "sob encomenda": sem número, sem reserva.
  const params = body.quantity === null
    ? { quantity: null }
    : body.delta !== undefined
      ? Number.isInteger(delta) && Math.abs(delta) <= 9999 ? { delta } : null
      : Number.isInteger(quantity) && quantity >= 0 && quantity <= 999999 ? { quantity } : null;
  if (!params) return c.json({ error: "Informe uma quantidade inteira válida." }, 400);

  const updated = await db.adjustProductStock(c.env.DB, { productId: product.id, storeId: store.id, ...params });
  if (!updated.ok) return c.json({ error: "Produto não encontrado nesta loja." }, 404);
  trilha("estoque_ajustado", {
    productId: product.id,
    storeId: store.id,
    ...params,
    antes: product.stock_quantity,
    depois: updated.quantity,
  });
  return c.json({ ok: true, productId: product.id, quantityAvailable: updated.quantity });
});

app.post("/api/store-products/:id/images", async (c) => {
  const body = await c.req.json<{ idToken?: unknown; imageUrls?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para editar as fotos." }, 401);
  const product = await db.getProductForStore(c.env.DB, c.req.param("id"), store.id);
  if (!product) return c.json({ error: "Produto não encontrado nesta loja." }, 404);
  const imageUrls = validProductImages(body.imageUrls, null);
  if (!imageUrls) return c.json({ error: "Mantenha de 1 a 5 fotos válidas." }, 400);
  await db.setProductImages(c.env.DB, product.id, store.id, imageUrls);
  return c.json({ ok: true, productId: product.id, imageUrl: imageUrls[0], imageUrls });
});

app.post("/api/store-products/:id/delete", async (c) => {
  const body = await c.req.json<StoreLoginBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para apagar um produto." }, 401);
  const product = await db.getProductForStore(c.env.DB, c.req.param("id"), store.id);
  if (!product) return c.json({ error: "Produto não encontrado nesta loja." }, 404);
  const deleted = await db.softDeleteProduct(c.env.DB, product.id, store.id);
  if (!deleted) return c.json({ error: "Este produto já foi apagado." }, 409);
  return c.json({ ok: true, productId: product.id, message: "Produto apagado do catálogo." });
});

/**
 * Envio de e-mail nunca derruba a operação — mas falha em silêncio some com o
 * aviso de pedido. Toda tentativa passa por aqui: o que não sair vira linha em
 * email_failures e aparece no painel do admin.
 */
/**
 * Aviso à administração de que há algo esperando no painel. Passa pelo mesmo
 * registro de falhas dos demais e-mails, com o storeId da loja que originou a
 * fila — assim uma falha de envio aponta para o caso concreto, não para o vazio.
 */
function notifyAdmin(env: Env, storeId: string, alerta: AdminAlert): Promise<void> {
  return trackEmail(
    env,
    `admin_${alerta.tipo}`,
    { id: storeId, email: env.ADMIN_EMAILS || "(sem administradores configurados)" },
    sendAdminAlertEmail(env, alerta),
  );
}

async function trackEmail(env: Env, kind: string, store: { id: string; email: string }, send: Promise<{ ok: boolean; error?: string; skipped?: boolean }>): Promise<void> {
  try {
    const result = await send;
    if (result.ok) return;
    await db.recordEmailFailure(env.DB, {
      kind,
      storeId: store.id,
      recipient: store.email,
      error: result.error ?? "Falha desconhecida no envio.",
      skipped: Boolean(result.skipped),
    });
  } catch (error) {
    await db.recordEmailFailure(env.DB, {
      kind,
      storeId: store.id,
      recipient: store.email,
      error: error instanceof Error ? error.message : String(error),
      skipped: false,
    }).catch(() => undefined);
  }
}

const ORDER_STATUSES = new Set<db.OrderStatus>(["reported", "paid", "delivered", "cancelled"]);

app.post("/api/store/orders/:orderId/delete", async (c) => {
  const body = await c.req.json<StoreLoginBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para excluir o pedido." }, 401);
  const orderId = c.req.param("orderId");
  const deleted = await db.deleteOrderForStore(c.env.DB, orderId, store.id);
  if (!deleted) return c.json({ error: "Pedido não encontrado nesta loja." }, 404);
  trilha("pedido_excluido", { orderId, storeId: store.id });
  return c.json({ ok: true, message: "Pedido excluído." });
});

app.post("/api/store/orders/:orderId/status", async (c) => {
  const body = await c.req.json<StoreLoginBody & { status?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para atualizar o pedido." }, 401);
  const status = typeof body.status === "string" ? body.status as db.OrderStatus : "reported";
  if (!ORDER_STATUSES.has(status)) return c.json({ error: "Situação inválida." }, 400);

  const orderId = c.req.param("orderId");
  const items = await db.listItemsOfOrder(c.env.DB, orderId, store.id);
  if (!items.length) return c.json({ error: "Pedido não encontrado nesta loja." }, 404);

  const current = await db.getOrderState(c.env.DB, orderId);
  const wasApplied = Boolean(current?.stock_applied);
  // O estoque já saiu quando o pedido foi criado: aqui ele só volta se o
  // vendedor cancelar, e sai de novo se ele reabrir um pedido cancelado.
  const shouldApply = status !== "cancelled";
  const stockDelta = shouldApply && !wasApplied
    ? items.map((item) => ({ productId: item.product_id, quantity: -item.quantity }))
    : !shouldApply && wasApplied
      ? items.map((item) => ({ productId: item.product_id, quantity: item.quantity }))
      : [];

  await db.setOrderState(c.env.DB, {
    orderId,
    storeId: store.id,
    status,
    stockDelta,
    stockApplied: shouldApply,
  });

  trilha("pedido_status", {
    orderId,
    storeId: store.id,
    de: current?.status ?? "reported",
    para: status,
    estoque: stockDelta.length ? (shouldApply ? "saiu" : "devolvido") : "sem mudança",
    unidades: stockDelta.reduce((soma, item) => soma + Math.abs(item.quantity), 0),
  });
  return c.json({
    ok: true,
    status,
    stockChanged: stockDelta.length > 0,
    stockDirection: stockDelta.length ? (shouldApply ? "out" : "back") : null,
  });
});

app.post("/api/store/profile", async (c) => {
  const body = await c.req.json<StoreLoginBody & { description?: unknown; openingHours?: unknown; checkoutRedirectUrl?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para editar a loja." }, 401);
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 280) : "";
  const parsed = readOpeningHours(body.openingHours);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const hasHours = parsed.hours.some(Boolean);
  const redirectInput = typeof body.checkoutRedirectUrl === "string" ? body.checkoutRedirectUrl.trim() : "";
  let checkoutRedirectUrl: string | null = null;
  if (redirectInput) {
    try {
      if (new URL(redirectInput).protocol !== "https:") throw new Error();
      checkoutRedirectUrl = redirectInput;
    } catch {
      return c.json({ error: "O link de redirecionamento precisa começar com https://" }, 400);
    }
  }
  await db.setStoreProfile(c.env.DB, store.id, {
    description: description || null,
    openingHours: hasHours ? JSON.stringify(parsed.hours) : null,
    checkoutRedirectUrl,
  });
  return c.json({ ok: true, description: description || null, checkoutRedirectUrl, ...openingStatus(hasHours ? JSON.stringify(parsed.hours) : null) });
});

const STORE_DELIVERY_VEHICLES = new Set([
  "gasoline_car",
  "ethanol_car",
  "electric_car",
  "gasoline_motorcycle",
  "cargo_bike",
]);

app.post("/api/store/delivery-vehicle", async (c) => {
  const body = await c.req.json<StoreLoginBody & { deliveryVehicle?: unknown; applyToProducts?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para alterar a entrega." }, 401);
  const deliveryVehicle = typeof body.deliveryVehicle === "string" ? body.deliveryVehicle.trim() : "";
  if (!STORE_DELIVERY_VEHICLES.has(deliveryVehicle)) return c.json({ error: "Escolha um veículo válido." }, 400);
  const applyToProducts = body.applyToProducts !== false;
  await db.setStoreDeliveryVehicle(c.env.DB, store.id, deliveryVehicle, applyToProducts);
  return c.json({ ok: true, deliveryVehicle, productsUpdated: applyToProducts });
});

app.post("/api/store/cover", async (c) => {
  const body = await c.req.json<{ idToken?: unknown; coverUrl?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  const coverUrl = typeof body.coverUrl === "string" ? body.coverUrl.trim() : "";
  try { if (!coverUrl || new URL(coverUrl).protocol !== "https:") throw new Error(); } catch { return c.json({ error: "Envie uma imagem válida." }, 400); }
  if (!store) return c.json({ error: "Faça login para alterar a capa." }, 401);
  await db.setStoreCover(c.env.DB, store.id, coverUrl);
  return c.json({ ok: true, coverUrl });
});

app.post("/api/store/logo", async (c) => {
  const body = await c.req.json<{ idToken?: unknown; logoUrl?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const store = await storeFromLogin(c.env, body);
  const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl.trim() : "";
  try { if (!logoUrl || new URL(logoUrl).protocol !== "https:") throw new Error(); } catch { return c.json({ error: "Envie uma imagem válida." }, 400); }
  if (!store) return c.json({ error: "Faça login para alterar a logo." }, 401);
  await db.setStoreLogo(c.env.DB, store.id, logoUrl);
  return c.json({ ok: true, logoUrl });
});

app.post("/api/store/upload", async (c) => {
  if (!(await allowedBy(c.env.UPLOAD_RATE_LIMITER, c, "upload"))) return c.json({ error: "Limite de fotos atingido. Aguarde um minuto." }, 429);
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const email = await firebaseVerifiedEmail(c.env, token);
  const store = email ? await db.getStoreByEmail(c.env.DB, email) : null;
  if (!store) return c.json({ error: "Entre com Google para enviar imagens." }, 401);
  const form = await c.req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "logo" ? "logos" : "produtos";
  if (!(file instanceof File)) return c.json({ error: "Escolha uma imagem." }, 400);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > 4_000_000) return c.json({ error: "Use JPG, PNG ou WebP com até 4 MB." }, 400);
  const upload = new FormData();
  upload.append("file", file, file.name || "imagem.webp");
  upload.append("upload_preset", c.env.CLOUDINARY_UPLOAD_PRESET);
  upload.append("folder", `semeia/${kind}`);
  // O preset do Cloudinary tira o nome do arquivo enviado, e o site mandava
  // sempre "produto.jpg": todas as fotos de todas as lojas caíam no mesmo
  // endereço, uma sobrescrevendo a outra. Era assim que um produto novo
  // aparecia com a foto de outro — inclusive de um já excluído, porque o
  // arquivo continua no Cloudinary depois que o anúncio sai do catálogo.
  // O nome passa a ser decidido aqui, e não pelo navegador.
  upload.append("public_id", `${store.id}-${crypto.randomUUID()}`);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.env.CLOUDINARY_CLOUD_NAME)}/image/upload`, { method: "POST", body: upload });
  const data = await response.json<{ secure_url?: string; error?: { message?: string } }>();
  if (!response.ok || !data.secure_url) return c.json({ error: data.error?.message ?? "Não foi possível enviar a imagem." }, 502);
  return c.json({ url: data.secure_url }, 201);
});

app.post("/api/store/pix", async (c) => {
  const body = await c.req.json<{
    idToken?: unknown;
    pixKey?: unknown;
    pixName?: unknown;
    pixCity?: unknown;
  }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);

  const store = await storeFromLogin(c.env, body);
  if (!store) return c.json({ error: "Faça login para alterar o Pix." }, 401);

  const clean = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const pixKey = normalizePixKey(clean(body.pixKey, 77));
  const pixName = clean(body.pixName, 25);
  const pixCity = clean(body.pixCity, 15);

  if (pixKey && (!pixName || !pixCity)) {
    return c.json({ error: "Informe também o nome de quem recebe e a cidade." }, 400);
  }

  await db.setStorePix(c.env.DB, store.id, {
    key: pixKey || null,
    name: pixKey ? pixName : null,
    city: pixKey ? pixCity : null,
  });
  return c.json({ ok: true, pixConfigured: Boolean(pixKey), pixKey, pixName, pixCity });
});

app.get("/api/oauth/connect", (c) =>
  c.json({ error: "A conexão de pagamentos foi desativada.", mode: "direct_contact" }, 410),
);

app.get("/api/oauth/callback", (c) =>
  c.json({ error: "A conexão de pagamentos foi desativada.", mode: "direct_contact" }, 410),
);

// ------------------------------------------------------------------ checkout ---

app.post("/api/checkout", (c) =>
  c.json(
    {
      error: "O Semeia não processa pagamentos. Fale diretamente com o vendedor pelo WhatsApp.",
      mode: "direct_contact",
    },
    410,
  ),
);

app.get("/api/orders/:id", (c) =>
  c.json({ error: "O Semeia não registra pedidos.", mode: "direct_contact" }, 410),
);

// ------------------------------------------------------------------- webhook ---

app.post("/api/webhooks/mercadopago", (c) =>
  c.json({ error: "O Mercado Pago não é usado nos destaques.", mode: "manual_payment" }, 410),
);

// --------------------------------------------------------------------- admin ---

app.use("/api/admin/*", async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const emergency = Boolean(token && c.env.ADMIN_TOKEN && await safeEqual(token, c.env.ADMIN_TOKEN));
  const email = emergency ? null : await firebaseVerifiedEmail(c.env, token);
  const adminEmails = new Set(
    c.env.ADMIN_EMAILS.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!emergency && (!email || !adminEmails.has(email))) {
    return c.json({ error: "Não autorizado." }, 401);
  }
  await next();
});

app.get("/api/admin/stores", async (c) => {
  const stores = await db.listStores(c.env.DB, c.req.query("status"));
  return c.json({
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      contactName: store.contact_name,
      email: store.email,
      whatsapp: store.whatsapp,
      category: store.category,
      region: store.region,
      seals: parseSeals(store.seals),
      plan: store.plan,
      status: store.status,
      slug: store.slug,
      mpConnected: Boolean(store.mp_access_token),
      createdAt: store.created_at,
    })),
  });
});

interface AdminStoreBody {
  name?: unknown;
  contactName?: unknown;
  email?: unknown;
  whatsapp?: unknown;
  category?: unknown;
  region?: unknown;
  pixKey?: unknown;
  pixName?: unknown;
  pixCity?: unknown;
}

// Cadastro direto pelo admin: a loja entra como se já aprovada, porque quem a
// digitou já conferiu os dados — não faz sentido ela esperar a própria fila de
// moderação. O login continua igual ao de qualquer loja: o dono entra com o
// Google usando este e-mail.
app.post("/api/admin/stores", async (c) => {
  const body = await c.req.json<AdminStoreBody>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const name = text(body.name);
  const contactName = text(body.contactName);
  const email = text(body.email);
  const category = text(body.category);
  const region = text(body.region) || SERVED_REGIONS[0] || "";
  const pixKey = normalizePixKey(text(body.pixKey));
  const pixName = text(body.pixName);
  const pixCity = text(body.pixCity);

  const missing = { name, contactName, email, category };
  const emptyField = Object.entries(missing).find(([, value]) => value.length === 0);
  if (emptyField) return c.json({ error: `Campo obrigatório faltando: ${emptyField[0]}.` }, 400);
  if (!PRODUCT_CATEGORIES.has(category)) return c.json({ error: "Escolha uma categoria válida." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "E-mail inválido." }, 400);
  const servedRegion = normalizeRegion(region);
  if (!servedRegion) return c.json({ error: `O Semeia começou por ${SERVED_REGIONS.join(", ")}.` }, 400);
  if (await db.getStoreByEmail(c.env.DB, email)) return c.json({ error: "Já existe uma loja com este e-mail." }, 409);

  const id = crypto.randomUUID();
  const slug = await uniqueStoreSlug(c.env.DB, name);
  await db.insertStore(c.env.DB, {
    id, slug, name, contactName, email,
    whatsapp: text(body.whatsapp) || null,
    paymentLink: null,
    category,
    region: servedRegion,
    seals: [],
    ownerPasswordHash: null,
    pixKey: pixKey || null,
    pixName: pixName || null,
    pixCity: pixCity || null,
  });
  await db.setStoreStatus(c.env.DB, id, "approved");
  c.executionCtx.waitUntil(
    trackEmail(c.env, "store_approved", { id, email }, sendStoreApprovedEmail(c.env, { id, name, contactName, email, slug })),
  );
  return c.json({ ok: true, storeId: id, slug }, 201);
});

app.get("/api/admin/email-failures", async (c) => {
  const failures = await db.listEmailFailures(c.env.DB);
  return c.json({
    configured: gmailConfigured(c.env),
    failures: failures.map((row) => ({
      id: row.id,
      kind: row.kind,
      storeId: row.store_id,
      recipient: row.recipient,
      error: row.error,
      skipped: Boolean(row.skipped),
      createdAt: row.created_at,
    })),
  });
});

app.get("/api/admin/impact", async (c) => {
  const impact = await db.getAdminImpact(c.env.DB);
  return c.json({
    snapshot: {
      approvedStores: impact.snapshot.approved_stores,
      pendingStores: impact.snapshot.pending_stores,
      activeProducts: impact.snapshot.active_products,
      regions: impact.snapshot.regions,
      catalogPotentialCo2Kg: impact.snapshot.catalog_co2_g / 1000,
      paidOrders: impact.snapshot.paid_orders,
      confirmedCo2Kg: impact.snapshot.confirmed_co2_g / 1000,
    },
    categories: impact.categories,
    regions: impact.regions,
  });
});

app.get("/api/admin/promotions", async (c) => {
  const promotions = await db.listPaidPromotionsForReview(c.env.DB);
  return c.json({ promotions: promotions.map(serializePromotion) });
});

app.post("/api/admin/promotions/:id/review", async (c) => {
  const body = await c.req.json<{ action?: unknown }>().catch(() => null);
  const approve = body?.action === "approve";
  if (!approve && body?.action !== "reject") return c.json({ error: "Ação inválida." }, 400);
  const promotion = await db.getPromotion(c.env.DB, c.req.param("id"));
  if (!promotion || promotion.status !== "paid_pending_review") return c.json({ error: "Este destaque não aguarda aprovação." }, 409);
  await db.reviewPromotion(c.env.DB, promotion.id, approve);
  const reviewed = approve ? await db.getPromotion(c.env.DB, promotion.id) : null;
  return c.json({
    ok: true,
    status: approve ? "approved" : "rejected",
    startsAt: reviewed?.starts_at ?? null,
    endsAt: reviewed?.ends_at ?? null,
  });
});

app.get("/api/admin/store-promotions", async (c) => {
  const promotions = await db.listPaidStorePromotionsForReview(c.env.DB);
  return c.json({ promotions: promotions.map(serializeStorePromotion) });
});

app.post("/api/admin/store-promotions/:id/review", async (c) => {
  const body = await c.req.json<{ action?: unknown }>().catch(() => null);
  const approve = body?.action === "approve";
  if (!approve && body?.action !== "reject") return c.json({ error: "Ação inválida." }, 400);
  const promotion = await db.getStorePromotion(c.env.DB, c.req.param("id"));
  if (!promotion || promotion.status !== "paid_pending_review") return c.json({ error: "Este destaque não aguarda aprovação." }, 409);
  await db.reviewStorePromotion(c.env.DB, promotion.id, approve);
  const reviewed = approve ? await db.getStorePromotion(c.env.DB, promotion.id) : null;
  return c.json({
    ok: true,
    status: approve ? "approved" : "rejected",
    startsAt: reviewed?.starts_at ?? null,
    endsAt: reviewed?.ends_at ?? null,
  });
});

app.post("/api/admin/stores/:id/status", async (c) => {
  const body = await c.req.json<{ status?: unknown }>().catch(() => null);
  const status = body?.status;
  if (status !== "pending" && status !== "approved" && status !== "suspended") {
    return c.json({ error: "status deve ser pending, approved ou suspended." }, 400);
  }

  const store = await db.getStore(c.env.DB, c.req.param("id"));
  if (!store) return c.json({ error: "Loja não encontrada." }, 404);

  await db.setStoreStatus(c.env.DB, store.id, status);

  // Só avisa nas viradas de verdade: repetir o mesmo status não reenvia e-mail.
  if (status === "suspended" && store.status !== "suspended") {
    // A suspensão não aparece em lugar nenhum para o lojista até ele tentar
    // publicar. Sem este aviso, ele descobre pelo erro.
    c.executionCtx.waitUntil(
      trackEmail(c.env, "store_suspended", store, sendStoreSuspendedEmail(c.env, {
        id: store.id,
        name: store.name,
        contactName: store.contact_name,
        email: store.email,
        slug: store.slug,
      })),
    );
  }
  if (status === "approved" && store.status !== "approved") {
    c.executionCtx.waitUntil(
      trackEmail(c.env, "store_approved", store, sendStoreApprovedEmail(c.env, {
        id: store.id,
        name: store.name,
        contactName: store.contact_name,
        email: store.email,
        slug: store.slug,
      })),
    );
  }

  return c.json({ ok: true, storeId: store.id, status });
});

// Reenvio manual: o painel decide quando mandar boas-vindas ou o aviso de
// aprovação. Diferente dos gatilhos automáticos, aqui a resposta diz se saiu.
app.post("/api/admin/stores/:id/email", async (c) => {
  const body = await c.req.json<{ kind?: unknown }>().catch(() => null);
  const kind = body?.kind === "approved" ? "approved" : "welcome";

  const store = await db.getStore(c.env.DB, c.req.param("id"));
  if (!store) return c.json({ error: "Loja não encontrada." }, 404);

  const target = {
    id: store.id,
    name: store.name,
    contactName: store.contact_name,
    email: store.email,
    slug: store.slug,
  };
  const result = kind === "approved"
    ? await sendStoreApprovedEmail(c.env, target)
    : await sendStoreWelcomeEmail(c.env, target);

  if (!result.ok) return c.json({ error: result.error || "Não foi possível enviar o e-mail." }, 502);
  return c.json({ ok: true, kind, sentTo: store.email, messageId: result.id ?? null });
});

app.post("/api/admin/stores/:id/plan", async (c) => {
  const body = await c.req.json<{ plan?: unknown }>().catch(() => null);
  const plan = body?.plan;
  if (plan !== "semente" && plan !== "raiz") {
    return c.json({ error: "plan deve ser semente ou raiz." }, 400);
  }

  const store = await db.getStore(c.env.DB, c.req.param("id"));
  if (!store) return c.json({ error: "Loja não encontrada." }, 404);

  await db.setStorePlan(c.env.DB, store.id, plan);
  return c.json({ ok: true, storeId: store.id, plan });
});

// Mesma validação do anúncio publicado pela loja (parseProductFields):
// conteúdo, frete, adicionais e a estimativa de CO₂ saem idênticos, só quem
// preenche muda. A única diferença é o storeId vir explícito no corpo, já que
// não existe idToken de loja aqui — é o admin escrevendo pela loja.
app.post("/api/admin/products", async (c) => {
  const body = await c.req.json<StoreProductBody & { storeId?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Corpo inválido." }, 400);
  const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
  if (!storeId) return c.json({ error: "Escolha a loja deste produto." }, 400);
  const store = await db.getStore(c.env.DB, storeId);
  if (!store) return c.json({ error: "Loja não encontrada." }, 404);
  const requestedId = typeof body.id === "string" ? body.id.trim() : "";
  if (!requestedId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedId)) return c.json({ error: "Revise o identificador do produto." }, 400);
  const fields = parseProductFields({
    ...body,
    deliveryVehicle: body.deliveryVehicle ?? store.delivery_vehicle ?? "gasoline_car",
  });
  if ("error" in fields) return c.json({ error: fields.error }, 400);
  let id = requestedId;
  if (await db.productIdExists(c.env.DB, id)) id = `${requestedId}-${crypto.randomUUID().slice(0, 6)}`;
  await db.insertProduct(c.env.DB, { ...fields, id, storeId });
  return c.json({ ok: true, productId: id }, 201);
});

// Mesmo upload assinado da loja, mas sem exigir o login dela: quem está
// cadastrando pelo admin ainda não tem uma sessão de dono de loja.
app.post("/api/admin/upload", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const storeId = typeof form.get("storeId") === "string" ? String(form.get("storeId")).trim() : "";
  const kind = form.get("kind") === "logo" ? "logos" : "produtos";
  if (!(file instanceof File)) return c.json({ error: "Escolha uma imagem." }, 400);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > 4_000_000) return c.json({ error: "Use JPG, PNG ou WebP com até 4 MB." }, 400);
  const upload = new FormData();
  upload.append("file", file, file.name || "imagem.webp");
  upload.append("upload_preset", c.env.CLOUDINARY_UPLOAD_PRESET);
  upload.append("folder", `semeia/${kind}`);
  upload.append("public_id", `${storeId || "admin"}-${crypto.randomUUID()}`);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.env.CLOUDINARY_CLOUD_NAME)}/image/upload`, { method: "POST", body: upload });
  const data = await response.json<{ secure_url?: string; error?: { message?: string } }>();
  if (!response.ok || !data.secure_url) return c.json({ error: data.error?.message ?? "Não foi possível enviar a imagem." }, 502);
  return c.json({ url: data.secure_url }, 201);
});

export default {
  fetch: app.fetch,
  /**
   * De hora em hora, devolve ao catálogo o estoque preso a pedidos que ninguém
   * confirmou em 24h. Sem isso, quem desiste depois de finalizar deixaria o
   * produto sumido da vitrine para sempre.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(db.releaseExpiredHolds(env.DB).then((released) => {
      trilha("reservas_liberadas", { pedidos: released, prazoHoras: db.STOCK_HOLD_SECONDS / 3600 });
    }));
  },
} satisfies ExportedHandler<Env>;
