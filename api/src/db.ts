/** Semeia — acesso ao Cloudflare D1. Todas as consultas ficam neste arquivo. */

export interface StoreRow {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  whatsapp: string | null;
  payment_link: string | null;
  category: string;
  region: string;
  seals: string;
  plan: "semente" | "raiz";
  status: "pending" | "approved" | "suspended";
  mp_user_id: string | null;
  mp_access_token: string | null;
  mp_refresh_token: string | null;
  mp_token_expires_at: number | null;
  owner_password_hash: string | null;
  pix_key: string | null;
  pix_name: string | null;
  pix_city: string | null;
  logo_url: string | null;
  cover_url: string | null;
  instagram: string | null;
  slug: string | null;
  description: string | null;
  opening_hours: string | null;
  created_at: number;
}

/** Faixa de frete. `upToKm` null é a última faixa ("acima da anterior");
 *  `feeCents` null significa "a combinar" com o vendedor.
 *
 *  `label` existe porque nem todo vendedor cobra por distância: há quem cobre
 *  por bairro ("Centro e Vila Nery") e quem cobre por regra ("R$ 1,00 por km
 *  rodado"). Quando vem preenchido, é ele que o comprador lê no lugar da faixa
 *  em quilômetros — e a faixa deixa de precisar de `upToKm`. */
export interface ShippingTier {
  upToKm: number | null;
  feeCents: number | null;
  label?: string | null;
}

export interface ProductRow {
  id: string;
  store_id: string;
  name: string;
  description: string;
  price_cents: number;
  previous_price_cents: number | null;
  unit: string;
  category: string;
  seals: string;
  co2_g: number;
  product_type: string;
  weight_kg: number | null;
  processing: string;
  packaging: string;
  refrigerated: number;
  delivery_method: string;
  pesticide_free: number;
  stock_quantity: number | null;
  shipping_fee_cents: number | null;
  shipping_tiers: string | null;
  pickup_address: string | null;
  content_amount: number | null;
  content_unit: string | null;
  image_url: string | null;
  image_urls: string | null;
  active: number;
  deleted_at: number | null;
  created_at: number;
}

export interface ProductWithStore extends ProductRow {
  store_name: string;
  store_region: string;
  store_whatsapp: string | null;
  store_payment_link: string | null;
  store_plan: StoreRow["plan"];
  store_status: StoreRow["status"];
  store_pix_key: string | null;
  store_pix_name: string | null;
  store_pix_city: string | null;
  store_logo_url: string | null;
  sponsored_position: number | null;
  sponsored_category_position: number | null;
  sponsored_category: string | null;
}

const PRODUCT_SELECT = `
  SELECT p.*,
         s.name AS store_name,
         s.region AS store_region,
         s.whatsapp AS store_whatsapp,
         s.payment_link AS store_payment_link,
         s.plan AS store_plan,
         s.status AS store_status,
         s.pix_key AS store_pix_key,
         s.pix_name AS store_pix_name,
         s.pix_city AS store_pix_city,
         s.logo_url AS store_logo_url,
         (SELECT pr.requested_position
            FROM product_promotions pr
           WHERE pr.product_id = p.id
             AND pr.status = 'approved'
             AND pr.placement_scope IN ('home', 'both')
             AND pr.starts_at <= unixepoch()
             AND pr.ends_at > unixepoch()
           ORDER BY pr.requested_position ASC
           LIMIT 1) AS sponsored_position
         ,(SELECT pr.requested_position
            FROM product_promotions pr
           WHERE pr.product_id = p.id
             AND pr.status = 'approved'
             AND pr.placement_scope IN ('category', 'both')
             AND pr.starts_at <= unixepoch()
             AND pr.ends_at > unixepoch()
           ORDER BY pr.requested_position ASC
           LIMIT 1) AS sponsored_category_position
         ,(SELECT pr.placement_category
            FROM product_promotions pr
           WHERE pr.product_id = p.id
             AND pr.status = 'approved'
             AND pr.placement_scope IN ('category', 'both')
             AND pr.starts_at <= unixepoch()
             AND pr.ends_at > unixepoch()
           ORDER BY pr.requested_position ASC
           LIMIT 1) AS sponsored_category
    FROM products p
    JOIN stores s ON s.id = p.store_id
`;

export interface ProductFilters {
  search?: string;
  categories?: string[];
  seals?: string[];
  region?: string;
  limit?: number;
  offset?: number;
}

export async function listProducts(
  database: D1Database,
  filters: ProductFilters,
): Promise<ProductWithStore[]> {
  const clauses = ["p.active = 1", "s.status = 'approved'"];
  const bindings: unknown[] = [];
  const bind = (value: unknown) => {
    bindings.push(value);
    return `?${bindings.length}`;
  };

  if (filters.search) {
    const placeholder = bind(`%${filters.search.toLowerCase()}%`);
    clauses.push(`(lower(p.name) LIKE ${placeholder} OR lower(s.name) LIKE ${placeholder})`);
  }
  if (filters.categories?.length) {
    clauses.push(`p.category IN (${filters.categories.map(bind).join(", ")})`);
  }
  if (filters.region) clauses.push(`s.region = ${bind(filters.region)}`);
  if (filters.seals?.length) {
    const sealClauses = filters.seals.map((seal) => `p.seals LIKE ${bind(`%"${seal}"%`)}`);
    clauses.push(`(${sealClauses.join(" OR ")})`);
  }

  const limit = Math.min(48, Math.max(1, filters.limit ?? 24));
  const offset = Math.max(0, filters.offset ?? 0);
  const query = `${PRODUCT_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY sponsored_position IS NULL, sponsored_position ASC, p.created_at DESC, p.name LIMIT ${limit + 1} OFFSET ${offset}`;
  const result = await database.prepare(query).bind(...bindings).all<ProductWithStore>();
  return result.results;
}

export function getProduct(database: D1Database, id: string): Promise<ProductWithStore | null> {
  return database
    .prepare(`${PRODUCT_SELECT} WHERE p.id = ?1 AND p.active = 1 AND s.status = 'approved'`)
    .bind(id)
    .first<ProductWithStore>();
}

export async function productIdExists(database: D1Database, id: string): Promise<boolean> {
  const row = await database.prepare("SELECT 1 AS found FROM products WHERE id = ?1 LIMIT 1").bind(id).first<{ found: number }>();
  return Boolean(row?.found);
}

export interface NewProduct {
  id: string;
  storeId: string;
  name: string;
  description: string;
  priceCents: number;
  unit: string;
  category: string;
  seals: string[];
  co2g: number;
  imageUrl: string | null;
  imageUrls?: string[];
  productType?: string;
  weightKg?: number | null;
  /** Conteúdo declarado pela loja: 500 + "ml", 1.2 + "kg", 12 + "un". */
  contentAmount?: number | null;
  contentUnit?: string | null;
  processing?: string;
  packaging?: string;
  refrigerated?: boolean;
  deliveryMethod?: string;
  pesticideFree?: boolean;
  stockQuantity?: number | null;
  shippingFeeCents?: number | null;
  shippingTiers?: ShippingTier[] | null;
  pickupAddress?: string | null;
}

export async function insertProduct(database: D1Database, product: NewProduct): Promise<void> {
  await database
    .prepare(`
      INSERT INTO products
        (id, store_id, name, description, price_cents, unit, category, seals, co2_g, image_url, image_urls,
         product_type, weight_kg, processing, packaging, refrigerated, delivery_method,
         pesticide_free, stock_quantity, shipping_fee_cents, shipping_tiers, pickup_address,
         content_amount, content_unit, active, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, 1, ?25)
    `)
    .bind(
      product.id,
      product.storeId,
      product.name,
      product.description,
      product.priceCents,
      product.unit,
      product.category,
      JSON.stringify(product.seals),
      product.co2g,
      product.imageUrl,
      JSON.stringify(product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []),
      product.productType ?? "other_food",
      product.weightKg ?? null,
      product.processing ?? "fresh",
      product.packaging ?? "none",
      product.refrigerated ? 1 : 0,
      product.deliveryMethod ?? "pickup",
      product.pesticideFree ? 1 : 0,
      product.stockQuantity ?? null,
      product.shippingFeeCents ?? null,
      product.shippingTiers?.length ? JSON.stringify(product.shippingTiers) : null,
      product.pickupAddress ?? null,
      product.contentAmount ?? null,
      product.contentUnit ?? null,
      Math.floor(Date.now() / 1000),
    )
    .run();
}

export async function updateProduct(database: D1Database, product: NewProduct): Promise<boolean> {
  const result = await database
    .prepare(`
      UPDATE products
         SET name = ?1,
             description = ?2,
             -- Guarda o preco anterior sempre que ele muda, para baixo ou para cima.
             previous_price_cents = CASE WHEN ?3 <> price_cents THEN price_cents ELSE previous_price_cents END,
             price_cents = ?3, unit = ?4, category = ?5, seals = ?6, co2_g = ?7,
             image_url = ?8, image_urls = ?9, product_type = ?10, weight_kg = ?11, processing = ?12,
             packaging = ?13, refrigerated = ?14, delivery_method = ?15, pesticide_free = ?16,
             stock_quantity = ?17, shipping_fee_cents = ?18, shipping_tiers = ?19, pickup_address = ?20,
             content_amount = ?23, content_unit = ?24
       WHERE id = ?21 AND store_id = ?22 AND deleted_at IS NULL
    `)
    .bind(
      product.name,
      product.description,
      product.priceCents,
      product.unit,
      product.category,
      JSON.stringify(product.seals),
      product.co2g,
      product.imageUrl,
      JSON.stringify(product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []),
      product.productType ?? "other_food",
      product.weightKg ?? null,
      product.processing ?? "fresh",
      product.packaging ?? "none",
      product.refrigerated ? 1 : 0,
      product.deliveryMethod ?? "pickup",
      product.pesticideFree ? 1 : 0,
      product.stockQuantity ?? null,
      product.shippingFeeCents ?? null,
      product.shippingTiers?.length ? JSON.stringify(product.shippingTiers) : null,
      product.pickupAddress ?? null,
      product.id,
      product.storeId,
      product.contentAmount ?? null,
      product.contentUnit ?? null,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * O Instagram saiu do perfil da loja. A coluna continua no banco com o que já
 * estava gravado — este UPDATE apenas deixou de tocá-la, para uma edição de
 * descrição ou horário não apagar dado antigo sem ninguém pedir.
 */
export async function setStoreProfile(database: D1Database, id: string, profile: {
  description: string | null; openingHours: string | null;
}): Promise<void> {
  await database.prepare("UPDATE stores SET description = ?1, opening_hours = ?2 WHERE id = ?3")
    .bind(profile.description, profile.openingHours, id).run();
}

/** Capa da vitrine — mesma origem da logo (upload assinado do Cloudinary). */
export async function setStoreCover(database: D1Database, storeId: string, coverUrl: string): Promise<void> {
  await database.prepare("UPDATE stores SET cover_url = ?1 WHERE id = ?2").bind(coverUrl, storeId).run();
}

export function getStore(database: D1Database, id: string): Promise<StoreRow | null> {
  return database.prepare("SELECT * FROM stores WHERE id = ?1").bind(id).first<StoreRow>();
}

export function getStoreBySlug(database: D1Database, slug: string): Promise<StoreRow | null> {
  return database.prepare("SELECT * FROM stores WHERE slug = ?1").bind(slug).first<StoreRow>();
}

export async function setStoreSlug(database: D1Database, storeId: string, slug: string): Promise<void> {
  await database.prepare("UPDATE stores SET slug = ?1 WHERE id = ?2").bind(slug, storeId).run();
}

export function getStoreByEmail(database: D1Database, email: string): Promise<StoreRow | null> {
  return database
    .prepare("SELECT * FROM stores WHERE lower(email) = lower(?1) ORDER BY created_at DESC LIMIT 1")
    .bind(email)
    .first<StoreRow>();
}

export function getStoreByMpUserId(database: D1Database, mpUserId: string): Promise<StoreRow | null> {
  return database
    .prepare("SELECT * FROM stores WHERE mp_user_id = ?1")
    .bind(mpUserId)
    .first<StoreRow>();
}

export interface NewStore {
  id: string;
  name: string;
  contactName: string;
  email: string;
  whatsapp: string | null;
  paymentLink: string | null;
  category: string;
  region: string;
  seals: string[];
  ownerPasswordHash: string | null;
  pixKey: string | null;
  pixName: string | null;
  pixCity: string | null;
  slug: string | null;
}

export async function insertStore(database: D1Database, store: NewStore): Promise<void> {
  await database
    .prepare(`
      INSERT INTO stores
        (id, name, contact_name, email, whatsapp, payment_link, category, region, seals, plan, status, owner_password_hash, pix_key, pix_name, pix_city, slug, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'semente', 'pending', ?10, ?11, ?12, ?13, ?14, ?15)
    `)
    .bind(
      store.id,
      store.name,
      store.contactName,
      store.email,
      store.whatsapp,
      store.paymentLink,
      store.category,
      store.region,
      JSON.stringify(store.seals),
      store.ownerPasswordHash,
      store.pixKey,
      store.pixName,
      store.pixCity,
      store.slug,
      Math.floor(Date.now() / 1000),
    )
    .run();
}

export async function saveStoreTokens(database: D1Database, storeId: string, tokens: {
  mpUserId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: number;
}): Promise<void> {
  await database
    .prepare(`
      UPDATE stores
         SET mp_user_id = ?1, mp_access_token = ?2, mp_refresh_token = ?3, mp_token_expires_at = ?4
       WHERE id = ?5
    `)
    .bind(
      tokens.mpUserId,
      tokens.encryptedAccessToken,
      tokens.encryptedRefreshToken,
      tokens.expiresAt,
      storeId,
    )
    .run();
}

export async function setStoreStatus(
  database: D1Database,
  storeId: string,
  status: StoreRow["status"],
): Promise<void> {
  await database.prepare("UPDATE stores SET status = ?1 WHERE id = ?2").bind(status, storeId).run();
}

export async function setStorePlan(
  database: D1Database,
  storeId: string,
  plan: StoreRow["plan"],
): Promise<void> {
  await database.prepare("UPDATE stores SET plan = ?1 WHERE id = ?2").bind(plan, storeId).run();
}

export async function setStoreLogo(database: D1Database, storeId: string, logoUrl: string): Promise<void> {
  await database.prepare("UPDATE stores SET logo_url = ?1 WHERE id = ?2").bind(logoUrl, storeId).run();
}

export async function setStorePix(
  database: D1Database,
  storeId: string,
  pix: { key: string | null; name: string | null; city: string | null },
): Promise<void> {
  await database
    .prepare("UPDATE stores SET pix_key = ?1, pix_name = ?2, pix_city = ?3 WHERE id = ?4")
    .bind(pix.key, pix.name, pix.city, storeId)
    .run();
}

export async function listStores(database: D1Database, status?: string): Promise<StoreRow[]> {
  const statement = status
    ? database.prepare("SELECT * FROM stores WHERE status = ?1 ORDER BY created_at DESC").bind(status)
    : database.prepare("SELECT * FROM stores ORDER BY created_at DESC");
  const result = await statement.all<StoreRow>();
  return result.results;
}

export async function listPublicStores(database: D1Database, limit = 100): Promise<StoreRow[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const result = await database
    .prepare(`SELECT id, name, contact_name, email, whatsapp, payment_link, category, region,
                    seals, plan, status, mp_user_id, mp_access_token, mp_refresh_token,
                    mp_token_expires_at, owner_password_hash, pix_key, pix_name, pix_city,
                    logo_url, slug, created_at
               FROM stores
              WHERE status = 'approved'
              ORDER BY name COLLATE NOCASE ASC
              LIMIT ?1`)
    .bind(safeLimit)
    .all<StoreRow>();
  return result.results;
}

export async function listProductsForStore(database: D1Database, storeId: string): Promise<ProductRow[]> {
  const result = await database.prepare("SELECT * FROM products WHERE store_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC").bind(storeId).all<ProductRow>();
  return result.results;
}

export async function registerProductView(database: D1Database, productId: string): Promise<void> {
  await database
    .prepare(`
      INSERT INTO product_views (product_id, views, updated_at)
      VALUES (?1, 1, ?2)
      ON CONFLICT(product_id) DO UPDATE SET views = views + 1, updated_at = ?2
    `)
    .bind(productId, Math.floor(Date.now() / 1000))
    .run();
}

export async function getViewsForStore(database: D1Database, storeId: string): Promise<Map<string, number>> {
  const result = await database
    .prepare(`
      SELECT pv.product_id AS product_id, pv.views AS views
        FROM product_views pv
        JOIN products p ON p.id = pv.product_id
       WHERE p.store_id = ?1
    `)
    .bind(storeId)
    .all<{ product_id: string; views: number }>();
  return new Map(result.results.map((row) => [row.product_id, row.views]));
}

export type StoreMetricType = "store_view" | "product_view" | "whatsapp_click";

export interface StoreMonthlyMetrics {
  totalViews: number;
  productViews: number;
  whatsappClicks: number;
  products: Map<string, { views: number; whatsappClicks: number }>;
}

export async function recordStoreMetric(
  database: D1Database,
  metric: { storeId: string; productId?: string | null; type: StoreMetricType; clientId: string },
): Promise<boolean> {
  const result = await database.prepare(`
    INSERT OR IGNORE INTO store_metric_events (store_id, product_id, metric_type, client_id)
    VALUES (?1, ?2, ?3, ?4)
  `).bind(metric.storeId, metric.productId ?? "", metric.type, metric.clientId).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getCurrentMonthMetricsForStore(database: D1Database, storeId: string): Promise<StoreMonthlyMetrics> {
  const result = await database.prepare(`
    SELECT product_id, metric_type, COUNT(*) AS total
      FROM store_metric_events
     WHERE store_id = ?1
       AND occurred_on >= date('now', 'start of month')
     GROUP BY product_id, metric_type
  `).bind(storeId).all<{ product_id: string; metric_type: StoreMetricType; total: number }>();

  const summary: StoreMonthlyMetrics = { totalViews: 0, productViews: 0, whatsappClicks: 0, products: new Map() };
  for (const row of result.results) {
    if (row.metric_type === "store_view") summary.totalViews += row.total;
    if (row.metric_type === "product_view") summary.productViews += row.total;
    if (row.metric_type === "whatsapp_click") summary.whatsappClicks += row.total;
    if (!row.product_id) continue;
    const product = summary.products.get(row.product_id) ?? { views: 0, whatsappClicks: 0 };
    if (row.metric_type === "product_view") product.views += row.total;
    if (row.metric_type === "whatsapp_click") product.whatsappClicks += row.total;
    summary.products.set(row.product_id, product);
  }
  return summary;
}

export interface ProductConfirmedStats {
  orders: number;
  revenueCents: number;
  co2g: number;
}

export async function getConfirmedStatsForStore(database: D1Database, storeId: string): Promise<Map<string, ProductConfirmedStats>> {
  const result = await database
    .prepare(`
      SELECT product_id,
             COUNT(*) AS orders,
             COALESCE(SUM(product_amount_cents), 0) AS revenue_cents,
             COALESCE(SUM(co2_g), 0) AS co2_g
        FROM direct_purchase_confirmations
       WHERE store_id = ?1 AND deleted_at IS NULL
       GROUP BY product_id
    `)
    .bind(storeId)
    .all<{ product_id: string; orders: number; revenue_cents: number; co2_g: number }>();
  return new Map(result.results.map((row) => [row.product_id, { orders: row.orders, revenueCents: row.revenue_cents, co2g: row.co2_g }]));
}

/**
 * Exclui um pedido para o vendedor: marca as linhas, devolve o estoque se ele
 * já tinha confirmado o Pix e limpa a situação. O registro fica no banco.
 */
export async function deleteOrderForStore(database: D1Database, orderId: string, storeId: string): Promise<boolean> {
  const items = await listItemsOfOrder(database, orderId, storeId);
  if (!items.length) return false;
  const state = await getOrderState(database, orderId);
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    database.prepare(`
      UPDATE direct_purchase_confirmations
         SET deleted_at = ?1
       WHERE (order_id = ?2 OR id = ?2) AND store_id = ?3 AND deleted_at IS NULL
    `).bind(now, orderId, storeId),
    database.prepare("DELETE FROM order_states WHERE order_id = ?1 AND store_id = ?2").bind(orderId, storeId),
  ];
  if (state?.stock_applied) {
    for (const item of items) {
      statements.push(database.prepare(`
        UPDATE products
           SET stock_quantity = MAX(0, COALESCE(stock_quantity, 0) + ?1)
         WHERE id = ?2 AND store_id = ?3 AND stock_quantity IS NOT NULL
      `).bind(item.quantity, item.product_id, storeId));
    }
  }
  await database.batch(statements);
  return true;
}

export interface StoreSalesByProduct {
  productId: string;
  productName: string;
  orders: number;
  units: number;
  revenueCents: number;
  lastAt: number;
}

/**
 * Vendas que o próprio vendedor confirmou (Pix recebido ou entregue).
 * É o número em que ele pode confiar, diferente da confirmação do comprador.
 */
export async function getSellerConfirmedSales(database: D1Database, storeId: string): Promise<{
  totals: { orders: number; delivered: number; units: number; revenueCents: number };
  byProduct: StoreSalesByProduct[];
}> {
  const byProduct = await database.prepare(`
    SELECT c.product_id,
           p.name AS product_name,
           COUNT(DISTINCT COALESCE(c.order_id, c.id)) AS orders,
           COALESCE(SUM(c.quantity), 0) AS units,
           COALESCE(SUM(c.product_amount_cents), 0) AS revenue_cents,
           MAX(c.created_at) AS last_at
      FROM direct_purchase_confirmations c
      JOIN order_states st ON st.order_id = COALESCE(c.order_id, c.id)
      JOIN products p ON p.id = c.product_id
     WHERE c.store_id = ?1 AND st.status IN ('paid', 'delivered') AND c.deleted_at IS NULL
     GROUP BY c.product_id
     ORDER BY revenue_cents DESC
  `).bind(storeId).all<{ product_id: string; product_name: string; orders: number; units: number; revenue_cents: number; last_at: number }>();

  const totals = await database.prepare(`
    SELECT COUNT(*) AS orders,
           COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered
      FROM order_states
     WHERE store_id = ?1 AND status IN ('paid', 'delivered')
  `).bind(storeId).first<{ orders: number; delivered: number }>();

  const units = byProduct.results.reduce((sum, row) => sum + Number(row.units || 0), 0);
  const revenueCents = byProduct.results.reduce((sum, row) => sum + Number(row.revenue_cents || 0), 0);

  return {
    totals: {
      orders: totals?.orders ?? 0,
      delivered: totals?.delivered ?? 0,
      units,
      revenueCents,
    },
    byProduct: byProduct.results.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      orders: row.orders,
      units: Number(row.units || 0),
      revenueCents: Number(row.revenue_cents || 0),
      lastAt: row.last_at,
    })),
  };
}

export function getProductForStore(database: D1Database, productId: string, storeId: string): Promise<ProductRow | null> {
  return database.prepare("SELECT * FROM products WHERE id = ?1 AND store_id = ?2 AND deleted_at IS NULL").bind(productId, storeId).first<ProductRow>();
}

export async function setProductImages(database: D1Database, productId: string, storeId: string, imageUrls: string[]): Promise<void> {
  await database.prepare("UPDATE products SET image_url = ?1, image_urls = ?2 WHERE id = ?3 AND store_id = ?4")
    .bind(imageUrls[0] ?? null, JSON.stringify(imageUrls), productId, storeId).run();
}

export async function softDeleteProduct(database: D1Database, productId: string, storeId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    database.prepare(`
      UPDATE products SET active = 0, deleted_at = ?1
       WHERE id = ?2 AND store_id = ?3 AND deleted_at IS NULL
    `).bind(now, productId, storeId),
    database.prepare(`
      UPDATE product_promotions
         SET status = 'rejected', reviewed_at = COALESCE(reviewed_at, ?1), ends_at = ?1, updated_at = ?1
       WHERE product_id = ?2 AND store_id = ?3
         AND status IN ('payment_pending','paid_pending_review','approved')
    `).bind(now, productId, storeId),
  ];
  const result = await database.batch(statements);
  return (result[0]?.meta.changes ?? 0) > 0;
}

export async function listPublicProductsForStore(database: D1Database, storeId: string): Promise<ProductWithStore[]> {
  const result = await database.prepare(`${PRODUCT_SELECT} WHERE p.store_id = ?1 AND p.active = 1 AND s.status = 'approved' ORDER BY p.created_at DESC`).bind(storeId).all<ProductWithStore>();
  return result.results;
}

export type PromotionStatus = "payment_pending" | "paid_pending_review" | "approved" | "rejected" | "payment_failed";

export interface PromotionRow {
  id: string;
  product_id: string;
  store_id: string;
  requested_position: number;
  placement_scope: "home" | "both" | "category";
  placement_category: string | null;
  duration_days: number;
  amount_cents: number;
  currency: string;
  status: PromotionStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  mp_payment_status: string | null;
  paid_at: number | null;
  reviewed_at: number | null;
  starts_at: number | null;
  ends_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface PromotionWithNames extends PromotionRow {
  product_name: string;
  store_name: string;
}

export async function insertPromotion(database: D1Database, promotion: {
  id: string; productId: string; storeId: string; position: number; durationDays: number; amountCents: number;
  placementScope: "home" | "both" | "category"; placementCategory: string | null;
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await database.prepare(`
    INSERT INTO product_promotions
      (id, product_id, store_id, requested_position, duration_days, amount_cents, placement_scope, placement_category, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'paid_pending_review', ?9, ?9)
  `).bind(promotion.id, promotion.productId, promotion.storeId, promotion.position, promotion.durationDays, promotion.amountCents, promotion.placementScope, promotion.placementCategory, now).run();
}

export async function attachPromotionPreference(database: D1Database, id: string, preferenceId: string): Promise<void> {
  await database.prepare("UPDATE product_promotions SET mp_preference_id = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(preferenceId, Math.floor(Date.now() / 1000), id).run();
}

export function getPromotion(database: D1Database, id: string): Promise<PromotionRow | null> {
  return database.prepare("SELECT * FROM product_promotions WHERE id = ?1").bind(id).first<PromotionRow>();
}

export async function listPromotionsForStore(database: D1Database, storeId: string): Promise<PromotionWithNames[]> {
  const result = await database.prepare(`
    SELECT pr.*, p.name AS product_name, s.name AS store_name
      FROM product_promotions pr
      JOIN products p ON p.id = pr.product_id
      JOIN stores s ON s.id = pr.store_id
     WHERE pr.store_id = ?1
     ORDER BY pr.created_at DESC LIMIT 30
  `).bind(storeId).all<PromotionWithNames>();
  return result.results;
}

export async function listPaidPromotionsForReview(database: D1Database): Promise<PromotionWithNames[]> {
  const result = await database.prepare(`
    SELECT pr.*, p.name AS product_name, s.name AS store_name
      FROM product_promotions pr
      JOIN products p ON p.id = pr.product_id
      JOIN stores s ON s.id = pr.store_id
     WHERE pr.status = 'paid_pending_review'
     ORDER BY pr.paid_at ASC
  `).all<PromotionWithNames>();
  return result.results;
}

export async function markPromotionPayment(database: D1Database, id: string, payment: {
  paymentId: string; paymentStatus: string; approved: boolean;
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await database.prepare(`
    UPDATE product_promotions
       SET status = ?1, mp_payment_id = ?2, mp_payment_status = ?3,
           paid_at = CASE WHEN ?4 = 1 THEN COALESCE(paid_at, ?5) ELSE paid_at END,
           updated_at = ?5
     WHERE id = ?6
  `).bind(payment.approved ? "paid_pending_review" : "payment_failed", payment.paymentId, payment.paymentStatus, payment.approved ? 1 : 0, now, id).run();
}

export async function activePromotionAtPosition(database: D1Database, position: number, scope: PromotionRow["placement_scope"], category: string | null): Promise<PromotionRow | null> {
  const scopeClause = scope === "home"
    ? "placement_scope IN ('home','both')"
    : scope === "category"
      ? "placement_scope IN ('category','both') AND placement_category = ?2"
      : "(placement_scope IN ('home','both') OR (placement_scope IN ('category','both') AND placement_category = ?2))";
  const statement = database.prepare(`SELECT * FROM product_promotions WHERE status = 'approved' AND requested_position = ?1 AND ends_at > unixepoch() AND ${scopeClause} LIMIT 1`);
  return (scope === "home" ? statement.bind(position) : statement.bind(position, category)).first<PromotionRow>();
}

function promotionConflictClause(scope: PromotionRow["placement_scope"]): string {
  if (scope === "home") return "placement_scope IN ('home','both')";
  if (scope === "category") return "placement_scope IN ('category','both') AND placement_category = ?1";
  return "(placement_scope IN ('home','both') OR (placement_scope IN ('category','both') AND placement_category = ?1))";
}

/** Posições já tomadas, considerando destaques de produto E de loja: as duas
 *  disputam os mesmos cinco lugares da vitrine. */
const TAKEN_POSITIONS_CTE = `
  WITH taken AS (
    SELECT requested_position, ends_at, placement_scope, placement_category
      FROM product_promotions
     WHERE status = 'approved' AND ends_at > unixepoch()
    UNION ALL
    SELECT requested_position, ends_at, placement_scope, placement_category
      FROM store_promotions
     WHERE status = 'approved' AND ends_at > unixepoch()
  )
`;

export async function promotionAvailability(database: D1Database, scope: PromotionRow["placement_scope"], category: string | null): Promise<Array<{ position: number; occupiedUntil: number | null }>> {
  const clause = promotionConflictClause(scope);
  const statement = database.prepare(`
    ${TAKEN_POSITIONS_CTE}
    SELECT requested_position AS position, MAX(ends_at) AS occupied_until
      FROM taken
     WHERE ${clause}
     GROUP BY requested_position
  `);
  const result = await (scope === "home" ? statement : statement.bind(category)).all<{ position: number; occupied_until: number | null }>();
  const occupied = new Map(result.results.map((row) => [row.position, row.occupied_until]));
  return [1, 2, 3, 4, 5].map((position) => ({ position, occupiedUntil: occupied.get(position) ?? null }));
}

export async function reviewPromotion(database: D1Database, id: string, approve: boolean): Promise<void> {
  const promotion = await getPromotion(database, id);
  if (!promotion || promotion.status !== "paid_pending_review") throw new Error("PROMOTION_NOT_REVIEWABLE");
  const now = Math.floor(Date.now() / 1000);
  if (!approve) {
    await database.prepare(`
      UPDATE product_promotions
         SET status = 'rejected', reviewed_at = ?1, starts_at = NULL, ends_at = NULL, updated_at = ?1
       WHERE id = ?2 AND status = 'paid_pending_review'
    `).bind(now, id).run();
    return;
  }

  const clause = promotionConflictClause(promotion.placement_scope).replaceAll("?1", "?3");
  const statement = database.prepare(`
    ${TAKEN_POSITIONS_CTE}
    , slot AS (
      SELECT MAX(ends_at) AS occupied_until
        FROM taken
       WHERE requested_position = ?2
         AND ${clause}
    ), schedule AS (
      SELECT MAX(?4, COALESCE(occupied_until, ?4)) AS starts_at FROM slot
    )
    UPDATE product_promotions
       SET status = 'approved', reviewed_at = ?4,
           starts_at = (SELECT starts_at FROM schedule),
           ends_at = (SELECT starts_at FROM schedule) + duration_days * 86400,
           updated_at = ?4
     WHERE id = ?1 AND status = 'paid_pending_review'
  `);
  if (promotion.placement_scope === "home") {
    await statement.bind(id, promotion.requested_position, null, now).run();
  } else {
    await statement.bind(id, promotion.requested_position, promotion.placement_category, now).run();
  }
}

// ------------------------------------------------- destaque de loja ---

export interface StorePromotionRow {
  id: string;
  store_id: string;
  requested_position: number;
  duration_days: number;
  amount_cents: number;
  placement_scope: "home" | "category" | "both";
  placement_category: string | null;
  currency: string;
  status: "payment_pending" | "paid_pending_review" | "approved" | "rejected" | "payment_failed";
  paid_at: number | null;
  reviewed_at: number | null;
  starts_at: number | null;
  ends_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface StorePromotionWithStore extends StorePromotionRow {
  store_name: string;
  store_region: string;
  store_slug: string | null;
  store_logo_url: string | null;
  store_category: string;
}

// Mesmas cinco posições do destaque de produto: loja e produto disputam a mesma vitrine.
export const STORE_PROMOTION_POSITIONS = [1, 2, 3, 4, 5];

export async function insertStorePromotion(database: D1Database, promotion: {
  id: string; storeId: string; position: number; durationDays: number; amountCents: number;
  placementScope: "home" | "both" | "category"; placementCategory: string | null;
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await database.prepare(`
    INSERT INTO store_promotions
      (id, store_id, requested_position, duration_days, amount_cents, placement_scope, placement_category, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'paid_pending_review', ?8, ?8)
  `).bind(promotion.id, promotion.storeId, promotion.position, promotion.durationDays, promotion.amountCents,
          promotion.placementScope, promotion.placementCategory, now).run();
}

export function getStorePromotion(database: D1Database, id: string): Promise<StorePromotionRow | null> {
  return database.prepare("SELECT * FROM store_promotions WHERE id = ?1").bind(id).first<StorePromotionRow>();
}

export async function listStorePromotionsForStore(database: D1Database, storeId: string): Promise<StorePromotionRow[]> {
  const result = await database
    .prepare("SELECT * FROM store_promotions WHERE store_id = ?1 ORDER BY created_at DESC LIMIT 30")
    .bind(storeId).all<StorePromotionRow>();
  return result.results;
}

export async function listPaidStorePromotionsForReview(database: D1Database): Promise<StorePromotionWithStore[]> {
  const result = await database.prepare(`
    SELECT sp.*, s.name AS store_name, s.region AS store_region, s.slug AS store_slug,
           s.logo_url AS store_logo_url, s.category AS store_category
      FROM store_promotions sp
      JOIN stores s ON s.id = sp.store_id
     WHERE sp.status = 'paid_pending_review'
     ORDER BY sp.created_at ASC
  `).all<StorePromotionWithStore>();
  return result.results;
}

/** Lojas com destaque ativo agora, com a posição e o escopo contratados. */
export async function listFeaturedStores(database: D1Database): Promise<Array<{
  position: number; placementScope: StorePromotionRow["placement_scope"]; placementCategory: string | null; store: StoreRow;
}>> {
  const result = await database.prepare(`
    SELECT sp.requested_position AS sponsored_position,
           sp.placement_scope AS sponsored_scope,
           sp.placement_category AS sponsored_category,
           s.*
      FROM store_promotions sp
      JOIN stores s ON s.id = sp.store_id
     WHERE sp.status = 'approved'
       AND sp.starts_at <= unixepoch()
       AND sp.ends_at > unixepoch()
       AND s.status = 'approved'
     ORDER BY sp.requested_position ASC
  `).all<StoreRow & { sponsored_position: number; sponsored_scope: StorePromotionRow["placement_scope"]; sponsored_category: string | null }>();
  // Uma loja pode ter contratado mais de uma posição: vale a melhor.
  const seen = new Set<string>();
  const featured = [];
  for (const row of result.results) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const { sponsored_position, sponsored_scope, sponsored_category, ...store } = row;
    featured.push({
      position: sponsored_position,
      placementScope: sponsored_scope,
      placementCategory: sponsored_category,
      store: store as StoreRow,
    });
  }
  return featured;
}

/** Mesma agenda do destaque de produto: loja e produto competem pelo mesmo lugar. */
export function storePromotionAvailability(
  database: D1Database,
  scope: StorePromotionRow["placement_scope"],
  category: string | null,
): Promise<Array<{ position: number; occupiedUntil: number | null }>> {
  return promotionAvailability(database, scope, category);
}

export async function reviewStorePromotion(database: D1Database, id: string, approve: boolean): Promise<void> {
  const promotion = await getStorePromotion(database, id);
  if (!promotion || promotion.status !== "paid_pending_review") throw new Error("STORE_PROMOTION_NOT_REVIEWABLE");
  const now = Math.floor(Date.now() / 1000);
  if (!approve) {
    await database.prepare(`
      UPDATE store_promotions
         SET status = 'rejected', reviewed_at = ?1, starts_at = NULL, ends_at = NULL, updated_at = ?1
       WHERE id = ?2 AND status = 'paid_pending_review'
    `).bind(now, id).run();
    return;
  }
  // A posição pode estar ocupada: o período começa quando a atual terminar.
  const clause = promotionConflictClause(promotion.placement_scope).replaceAll("?1", "?3");
  const statement = database.prepare(`
    ${TAKEN_POSITIONS_CTE}
    , slot AS (
      SELECT MAX(ends_at) AS occupied_until
        FROM taken
       WHERE requested_position = ?2
         AND ${clause}
    ), schedule AS (
      SELECT MAX(?4, COALESCE(occupied_until, ?4)) AS starts_at FROM slot
    )
    UPDATE store_promotions
       SET status = 'approved', reviewed_at = ?4,
           starts_at = (SELECT starts_at FROM schedule),
           ends_at = (SELECT starts_at FROM schedule) + duration_days * 86400,
           updated_at = ?4
     WHERE id = ?1 AND status = 'paid_pending_review'
  `);
  if (promotion.placement_scope === "home") {
    await statement.bind(id, promotion.requested_position, null, now).run();
  } else {
    await statement.bind(id, promotion.requested_position, promotion.placement_category, now).run();
  }
}


export type FulfillmentMethod = "walk" | "bike" | "vehicle" | "delivery";

export interface DirectPurchaseConfirmation {
  id: string;
  orderId: string;
  productId: string;
  storeId: string;
  fulfillmentMethod: FulfillmentMethod;
  productAmountCents: number;
  shippingFeeCents: number | null;
  co2g: number;
  quantity: number;
  buyerName: string | null;
  buyerWhatsapp: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string | null;
  product_id: string;
  product_name: string;
  fulfillment_method: FulfillmentMethod;
  product_amount_cents: number;
  shipping_fee_cents: number | null;
  quantity: number;
  buyer_name: string | null;
  buyer_whatsapp: string | null;
  co2_g: number;
  created_at: number;
}

/** Registra uma finalização declarada pelo comprador. O id único torna a chamada idempotente. */
export async function insertDirectPurchaseConfirmation(
  database: D1Database,
  confirmation: DirectPurchaseConfirmation,
): Promise<boolean> {
  const result = await database.prepare(`
    INSERT OR IGNORE INTO direct_purchase_confirmations
      (id, order_id, product_id, store_id, fulfillment_method, product_amount_cents, shipping_fee_cents,
       co2_g, quantity, buyer_name, buyer_whatsapp, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
  `).bind(
    confirmation.id,
    confirmation.orderId,
    confirmation.productId,
    confirmation.storeId,
    confirmation.fulfillmentMethod,
    confirmation.productAmountCents,
    confirmation.shippingFeeCents,
    confirmation.co2g,
    confirmation.quantity,
    confirmation.buyerName,
    confirmation.buyerWhatsapp,
    Math.floor(Date.now() / 1000),
  ).run();
  return result.meta.changes > 0;
}

export type OrderStatus = "reported" | "paid" | "delivered" | "cancelled";

export interface OrderStateRow {
  order_id: string;
  store_id: string;
  status: OrderStatus;
  stock_applied: number;
  paid_at: number | null;
  delivered_at: number | null;
  updated_at: number;
}

export async function listOrderStatesForStore(database: D1Database, storeId: string): Promise<OrderStateRow[]> {
  const result = await database
    .prepare("SELECT * FROM order_states WHERE store_id = ?1")
    .bind(storeId).all<OrderStateRow>();
  return result.results;
}

export function getOrderState(database: D1Database, orderId: string): Promise<OrderStateRow | null> {
  return database.prepare("SELECT * FROM order_states WHERE order_id = ?1").bind(orderId).first<OrderStateRow>();
}

/** Itens de um pedido específico desta loja — usado para mexer no estoque. */
export async function listItemsOfOrder(database: D1Database, orderId: string, storeId: string): Promise<Array<{ product_id: string; quantity: number }>> {
  const result = await database.prepare(`
    SELECT product_id, quantity
      FROM direct_purchase_confirmations
     WHERE (order_id = ?1 OR id = ?1) AND store_id = ?2 AND deleted_at IS NULL
  `).bind(orderId, storeId).all<{ product_id: string; quantity: number }>();
  return result.results;
}

/**
 * Grava a situação do pedido e, quando pedido, aplica ou devolve o estoque na
 * mesma remessa — para o vendedor nunca ver estoque e situação desencontrados.
 */
export async function setOrderState(database: D1Database, params: {
  orderId: string; storeId: string; status: OrderStatus;
  stockDelta: Array<{ productId: string; quantity: number }>;
  stockApplied: boolean;
}): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    database.prepare(`
      INSERT INTO order_states (order_id, store_id, status, stock_applied, paid_at, delivered_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(order_id) DO UPDATE SET
        status = ?3,
        stock_applied = ?4,
        paid_at = COALESCE(order_states.paid_at, ?5),
        delivered_at = COALESCE(order_states.delivered_at, ?6),
        updated_at = ?7
    `).bind(
      params.orderId,
      params.storeId,
      params.status,
      params.stockApplied ? 1 : 0,
      params.status === "paid" || params.status === "delivered" ? now : null,
      params.status === "delivered" ? now : null,
      now,
    ),
  ];
  // Estoque nunca fica negativo: um pedido maior que o saldo apenas zera a quantidade.
  for (const item of params.stockDelta) {
    statements.push(database.prepare(`
      UPDATE products
         SET stock_quantity = MAX(0, COALESCE(stock_quantity, 0) + ?1)
       WHERE id = ?2 AND store_id = ?3 AND stock_quantity IS NOT NULL
    `).bind(item.quantity, item.productId, params.storeId));
  }
  await database.batch(statements);
}

/**
 * Repõe (ou corrige) o estoque de um produto direto do painel.
 *
 * `delta` soma sobre o valor atual — é o caminho seguro para repor, porque não
 * atropela uma reserva feita entre a leitura da tela e o clique. `quantity`
 * grava um número fechado, para quando o vendedor conta o que tem na prateleira.
 */
/**
 * `quantity: null` é o produto sob encomenda — sem quantidade pronta e fora da
 * reserva de estoque. Por isso o retorno separa "não encontrei o produto"
 * (`ok: false`) de "a quantidade agora é nenhuma" (`quantity: null`): antes o
 * null virava 0 no caminho de volta e os dois casos ficavam iguais.
 */
export async function adjustProductStock(database: D1Database, params: {
  productId: string; storeId: string; delta?: number; quantity?: number | null;
}): Promise<{ ok: false } | { ok: true; quantity: number | null }> {
  const statement = params.delta !== undefined
    ? database.prepare(`
        UPDATE products
           SET stock_quantity = MAX(0, COALESCE(stock_quantity, 0) + ?1)
         WHERE id = ?2 AND store_id = ?3 AND deleted_at IS NULL
      `).bind(params.delta, params.productId, params.storeId)
    : database.prepare(`
        UPDATE products SET stock_quantity = ?1
         WHERE id = ?2 AND store_id = ?3 AND deleted_at IS NULL
      `).bind(params.quantity ?? null, params.productId, params.storeId);
  const result = await statement.run();
  if (!result.meta.changes) return { ok: false };
  const row = await database
    .prepare("SELECT stock_quantity FROM products WHERE id = ?1 AND store_id = ?2")
    .bind(params.productId, params.storeId).first<{ stock_quantity: number | null }>();
  return { ok: true, quantity: row?.stock_quantity ?? null };
}

/**
 * Unidades presas em pedidos informados e ainda não confirmados pelo vendedor.
 *
 * É o que explica um produto aparecer esgotado sem ter sido vendido: as peças
 * estão reservadas, não escoadas. Só conta reserva viva (stock_applied = 1) —
 * quando o prazo vence, o estoque volta e o produto some daqui.
 */
export async function getReservedUnits(database: D1Database, storeId?: string): Promise<Map<string, number>> {
  const scoped = storeId !== undefined;
  const statement = database.prepare(`
    SELECT c.product_id, SUM(c.quantity) AS units
      FROM direct_purchase_confirmations c
      JOIN order_states s ON s.order_id = COALESCE(c.order_id, c.id) AND s.store_id = c.store_id
     WHERE c.deleted_at IS NULL AND s.status = 'reported' AND s.stock_applied = 1
       ${scoped ? "AND c.store_id = ?1" : ""}
     GROUP BY c.product_id
  `);
  const result = await (scoped ? statement.bind(storeId) : statement).all<{ product_id: string; units: number }>();
  return new Map(result.results.map((row) => [row.product_id, Number(row.units) || 0]));
}

/** Quanto tempo o estoque fica preso a um pedido que ninguém confirmou. */
export const STOCK_HOLD_SECONDS = 24 * 60 * 60;

/**
 * Segura o estoque na hora em que o pedido nasce, para dois compradores não
 * fecharem a última unidade ao mesmo tempo.
 *
 * A baixa é condicional (`stock_quantity >= ?`), então quem chegar depois não
 * consegue derrubar o saldo para baixo de zero: a atualização simplesmente não
 * acontece e devolvemos o que já tinha saído. Produtos sem estoque informado
 * ficam de fora — a loja controla por fora e não queremos inventar número.
 */
export async function holdStockForOrder(database: D1Database, params: {
  orderId: string; storeId: string;
  items: Array<{ productId: string; quantity: number; controlled: boolean }>;
}): Promise<{ ok: true } | { ok: false; productId: string }> {
  const controlled = params.items.filter((item) => item.controlled);
  const now = Math.floor(Date.now() / 1000);
  if (controlled.length) {
    const results = await database.batch(controlled.map((item) => database.prepare(`
      UPDATE products
         SET stock_quantity = stock_quantity - ?1
       WHERE id = ?2 AND store_id = ?3 AND stock_quantity IS NOT NULL AND stock_quantity >= ?1
    `).bind(item.quantity, item.productId, params.storeId)));
    const lost = controlled.findIndex((_, index) => (results[index]?.meta.changes ?? 0) === 0);
    if (lost >= 0) {
      // Alguém levou as últimas unidades no meio do caminho: desfaz o que saiu.
      const done = controlled.slice(0, lost);
      if (done.length) {
        await database.batch(done.map((item) => database.prepare(`
          UPDATE products
             SET stock_quantity = stock_quantity + ?1
           WHERE id = ?2 AND store_id = ?3 AND stock_quantity IS NOT NULL
        `).bind(item.quantity, item.productId, params.storeId)));
      }
      return { ok: false, productId: controlled[lost]!.productId };
    }
  }
  await database.prepare(`
    INSERT INTO order_states (order_id, store_id, status, stock_applied, paid_at, delivered_at, updated_at)
    VALUES (?1, ?2, 'reported', ?3, NULL, NULL, ?4)
    ON CONFLICT(order_id) DO UPDATE SET stock_applied = ?3, updated_at = ?4
  `).bind(params.orderId, params.storeId, controlled.length ? 1 : 0, now).run();
  return { ok: true };
}

/**
 * Devolve ao catálogo o estoque de pedidos que ninguém confirmou dentro do prazo.
 *
 * O pedido continua na lista do vendedor: só a reserva cai. Se o comprador
 * aparecer depois, confirmar o Pix baixa o estoque de novo.
 */
export async function releaseExpiredHolds(database: D1Database, olderThanSeconds = STOCK_HOLD_SECONDS): Promise<number> {
  const limit = Math.floor(Date.now() / 1000) - olderThanSeconds;
  const expired = await database.prepare(`
    SELECT order_id, store_id FROM order_states
     WHERE status = 'reported' AND stock_applied = 1 AND updated_at < ?1
     LIMIT 100
  `).bind(limit).all<{ order_id: string; store_id: string }>();
  let released = 0;
  for (const row of expired.results) {
    const items = await listItemsOfOrder(database, row.order_id, row.store_id);
    const statements = items.map((item) => database.prepare(`
      UPDATE products
         SET stock_quantity = MAX(0, COALESCE(stock_quantity, 0) + ?1)
       WHERE id = ?2 AND store_id = ?3 AND stock_quantity IS NOT NULL
    `).bind(item.quantity, item.product_id, row.store_id));
    statements.push(database.prepare(
      "UPDATE order_states SET stock_applied = 0 WHERE order_id = ?1 AND store_id = ?2",
    ).bind(row.order_id, row.store_id));
    await database.batch(statements);
    released += 1;
  }
  return released;
}

/** Pedidos que os compradores informaram para esta loja, do mais recente para o mais antigo. */
export async function listOrderItemsForStore(database: D1Database, storeId: string): Promise<OrderItemRow[]> {
  const result = await database.prepare(`
    SELECT c.id, c.order_id, c.product_id, p.name AS product_name, c.fulfillment_method,
           c.product_amount_cents, c.shipping_fee_cents, c.quantity,
           c.buyer_name, c.buyer_whatsapp, c.co2_g, c.created_at
      FROM direct_purchase_confirmations c
      JOIN products p ON p.id = c.product_id
     WHERE c.store_id = ?1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC, c.id ASC
     LIMIT 200
  `).bind(storeId).all<OrderItemRow>();
  return result.results;
}

/**
 * Guarda um e-mail que não saiu.
 *
 * O envio nunca derruba a requisição — mas silêncio total também não serve:
 * é isto que permite o painel do admin avisar que os vendedores pararam de
 * receber aviso de pedido.
 */
export async function recordEmailFailure(database: D1Database, failure: {
  kind: string; storeId: string | null; recipient: string | null; error: string; skipped: boolean;
}): Promise<void> {
  await database.prepare(`
    INSERT INTO email_failures (id, kind, store_id, recipient, error, skipped, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  `).bind(
    crypto.randomUUID(),
    failure.kind,
    failure.storeId,
    failure.recipient,
    failure.error.slice(0, 400),
    failure.skipped ? 1 : 0,
    Math.floor(Date.now() / 1000),
  ).run();
}

export interface EmailFailureRow {
  id: string;
  kind: string;
  store_id: string | null;
  recipient: string | null;
  error: string;
  skipped: number;
  created_at: number;
}

/** Falhas recentes, da mais nova para a mais antiga. */
export async function listEmailFailures(database: D1Database, sinceSeconds = 7 * 24 * 60 * 60, limit = 20): Promise<EmailFailureRow[]> {
  const since = Math.floor(Date.now() / 1000) - sinceSeconds;
  const result = await database.prepare(`
    SELECT * FROM email_failures WHERE created_at >= ?1 ORDER BY created_at DESC LIMIT ?2
  `).bind(since, limit).all<EmailFailureRow>();
  return result.results;
}

export interface ImpactTotals {
  co2_g: number;
  stores: number;
  products: number;
}

export async function getImpactTotals(database: D1Database): Promise<ImpactTotals> {
  const row = await database.prepare(`
    SELECT
      (SELECT COALESCE(SUM(co2_g), 0) FROM direct_purchase_confirmations WHERE deleted_at IS NULL) AS co2_g,
      (SELECT COUNT(*) FROM stores WHERE status = 'approved') AS stores,
      (SELECT COUNT(*)
         FROM products p
         JOIN stores s ON s.id = p.store_id
        WHERE p.active = 1 AND s.status = 'approved') AS products
  `).first<ImpactTotals>();
  return row ?? { co2_g: 0, stores: 0, products: 0 };
}

export interface AdminImpactSnapshot {
  approved_stores: number;
  pending_stores: number;
  active_products: number;
  regions: number;
  catalog_co2_g: number;
  paid_orders: number;
  confirmed_co2_g: number;
}

export interface ImpactBreakdown {
  label: string;
  total: number;
}

export interface AdminImpact {
  snapshot: AdminImpactSnapshot;
  categories: ImpactBreakdown[];
  regions: ImpactBreakdown[];
}

/** Dados administrativos sem projeções externas: tudo vem do catálogo e dos pedidos no D1. */
export async function getAdminImpact(database: D1Database): Promise<AdminImpact> {
  const [snapshot, categories, regions] = await Promise.all([
    database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM stores WHERE status = 'approved') AS approved_stores,
        (SELECT COUNT(*) FROM stores WHERE status = 'pending') AS pending_stores,
        (SELECT COUNT(*) FROM products p JOIN stores s ON s.id = p.store_id
          WHERE p.active = 1 AND s.status = 'approved') AS active_products,
        (SELECT COUNT(DISTINCT trim(region)) FROM stores
          WHERE status = 'approved' AND trim(region) <> '') AS regions,
        (SELECT COALESCE(SUM(p.co2_g), 0) FROM products p JOIN stores s ON s.id = p.store_id
          WHERE p.active = 1 AND s.status = 'approved') AS catalog_co2_g,
        (SELECT COUNT(*) FROM direct_purchase_confirmations WHERE deleted_at IS NULL) AS paid_orders,
        (SELECT COALESCE(SUM(co2_g), 0) FROM direct_purchase_confirmations WHERE deleted_at IS NULL) AS confirmed_co2_g
    `).first<AdminImpactSnapshot>(),
    database.prepare(`
      SELECT p.category AS label, COUNT(*) AS total
        FROM products p JOIN stores s ON s.id = p.store_id
       WHERE p.active = 1 AND s.status = 'approved'
       GROUP BY p.category ORDER BY total DESC, label ASC
    `).all<ImpactBreakdown>(),
    database.prepare(`
      SELECT trim(region) AS label, COUNT(*) AS total
        FROM stores
       WHERE status = 'approved' AND trim(region) <> ''
       GROUP BY trim(region) ORDER BY total DESC, label ASC
    `).all<ImpactBreakdown>(),
  ]);

  return {
    snapshot: snapshot ?? {
      approved_stores: 0, pending_stores: 0, active_products: 0, regions: 0,
      catalog_co2_g: 0, paid_orders: 0, confirmed_co2_g: 0,
    },
    categories: categories.results,
    regions: regions.results,
  };
}
