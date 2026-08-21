/**
 * Semeia — tradução das linhas do banco para o JSON que o site consome.
 *
 * É a fronteira entre o formato do D1 (snake_case, JSON em texto) e o contrato
 * público da API: mudar um nome aqui muda o site inteiro.
 */

import * as db from "./db";
import {
  defaultWeightKg,
  estimateLifecycleSavings,
  inferProductType,
  isDeliveryMethod,
  isPackaging,
  isProcessing,
  isProductType,
} from "./impact";
import { contentLabel, openingStatus, parseImageUrls, parseProductAddons, parseSeals, parseShippingTiers } from "./parsing";

export const FULFILLMENT_LABELS: Record<string, string> = {
  walk: "Retirada a pé",
  bike: "Retirada de bicicleta",
  vehicle: "Retirada com carro ou moto",
  delivery: "Entrega pelo vendedor",
};

export function serializeProduct(row: db.ProductWithStore, reservedUnits = 0) {
  const inferredFromName = inferProductType(row.name, "");
  const inferredType = inferProductType(row.name, row.category);
  const nameIdentifiesFood = inferredFromName !== "other_food" && inferredFromName !== "not_applicable";
  const productType = nameIdentifiesFood
    ? inferredFromName
    : isProductType(row.product_type) && row.product_type !== "other_food"
      ? row.product_type
      : inferredType;
  const impactEstimate = estimateLifecycleSavings({
    productType,
    weightKg: row.weight_kg && row.weight_kg > 0 ? row.weight_kg : defaultWeightKg(row.unit),
    processing: isProcessing(row.processing) ? row.processing : "fresh",
    packaging: isPackaging(row.packaging) ? row.packaging : "none",
    refrigerated: Boolean(row.refrigerated),
    deliveryMethod: isDeliveryMethod(row.delivery_method) ? row.delivery_method : "pickup",
    pesticideFree: Boolean(row.pesticide_free),
  });
  const co2g = Math.round(impactEstimate.savingsKg * 1000);
  // O preco anterior vale nos dois sentidos: queda vira "% OFF", aumento vira "+%".
  const previousPriceCents = row.previous_price_cents && row.previous_price_cents !== row.price_cents
    ? row.previous_price_cents
    : null;
  const priceWentDown = previousPriceCents !== null && previousPriceCents > row.price_cents;
  const priceWentUp = previousPriceCents !== null && previousPriceCents < row.price_cents;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price_cents / 100,
    previousPrice: previousPriceCents === null ? null : previousPriceCents / 100,
    priceChange: priceWentDown ? "down" : priceWentUp ? "up" : null,
    discountPercent: priceWentDown && previousPriceCents
      ? Math.max(1, Math.round((1 - row.price_cents / previousPriceCents) * 100))
      : null,
    increasePercent: priceWentUp && previousPriceCents
      ? Math.max(1, Math.round((row.price_cents / previousPriceCents - 1) * 100))
      : null,
    unit: row.unit,
    cat: row.category,
    seals: parseSeals(row.seals),
    co2kg: co2g / 1000,
    impactEstimate,
    imageUrl: parseImageUrls(row.image_urls, row.image_url)[0] ?? null,
    imageUrls: parseImageUrls(row.image_urls, row.image_url),
    supplier: row.store_name,
    storeLogoUrl: row.store_logo_url,
    region: row.store_region,
    whats: row.store_whatsapp,
    checkoutRedirectUrl: row.store_checkout_redirect_url,
    pixKey: row.store_pix_key,
    pixName: row.store_pix_name,
    pixCity: row.store_pix_city,
    storeId: row.store_id,
    quantityAvailable: row.stock_quantity,
    // Unidades já presas em pedidos de outros compradores, aguardando confirmação.
    reservedUnits,
    shippingFee: row.shipping_fee_cents === null ? null : row.shipping_fee_cents / 100,
    shippingTiers: parseShippingTiers(row.shipping_tiers),
    deliveryVehicle: row.delivery_vehicle,
    pickupAddress: row.pickup_address,
    // Quanto vem em cada venda, quando a loja informou: "500 ml", "1,5 kg".
    contentAmount: row.content_amount,
    contentUnit: row.content_unit,
    content: contentLabel(row.content_amount, row.content_unit),
    addons: parseProductAddons(row.addons),
    sponsoredPosition: row.sponsored_position,
    sponsoredCategoryPosition: row.sponsored_category_position,
    sponsoredCategory: row.sponsored_category,
  };
}

export function serializeOwnerStore(
  store: db.StoreRow,
  products: db.ProductRow[],
  views: Map<string, number>,
  confirmed: Map<string, db.ProductConfirmedStats>,
  monthly: db.StoreMonthlyMetrics,
  reserved: Map<string, number>,
) {
  const now = Math.floor(Date.now() / 1000);
  return {
    store: {
      id: store.id,
      slug: store.slug,
      name: store.name,
      region: store.region,
      category: store.category,
      status: store.status,
      whatsapp: store.whatsapp,
      email: store.email,
      pixConfigured: Boolean(store.pix_key),
      pixKey: store.pix_key,
      pixName: store.pix_name,
      pixCity: store.pix_city,
      logoUrl: store.logo_url,
      coverUrl: store.cover_url,
      description: store.description,
      checkoutRedirectUrl: store.checkout_redirect_url,
      deliveryVehicle: store.delivery_vehicle || "gasoline_car",
      ...openingStatus(store.opening_hours),
    },
    products: products.map((product) => {
      const stats = confirmed.get(product.id);
      const daysListed = Math.max(1, Math.round((now - product.created_at) / 86400));
      const productViews = views.get(product.id) ?? 0;
      return {
        id: product.id,
        name: product.name,
        price: product.price_cents / 100,
        previousPrice: product.previous_price_cents && product.previous_price_cents !== product.price_cents
          ? product.previous_price_cents / 100
          : null,
        unit: product.unit,
        imageUrl: parseImageUrls(product.image_urls, product.image_url)[0] ?? null,
        imageUrls: parseImageUrls(product.image_urls, product.image_url),
        active: Boolean(product.active),
        quantityAvailable: product.stock_quantity,
        // Presas em pedidos aguardando o vendedor confirmar o pagamento.
        reservedUnits: reserved.get(product.id) ?? 0,
        shippingFee: product.shipping_fee_cents === null ? null : product.shipping_fee_cents / 100,
        shippingTiers: parseShippingTiers(product.shipping_tiers),
        deliveryVehicle: product.delivery_vehicle,
        pickupAddress: product.pickup_address,
        contentAmount: product.content_amount,
        contentUnit: product.content_unit,
        content: contentLabel(product.content_amount, product.content_unit),
        addons: parseProductAddons(product.addons),
        views: productViews,
        viewsPerDay: productViews / daysListed,
        daysListed,
        confirmedOrders: stats?.orders ?? 0,
        confirmedRevenue: (stats?.revenueCents ?? 0) / 100,
        confirmedCo2Kg: (stats?.co2g ?? 0) / 1000,
        monthlyViews: monthly.products.get(product.id)?.views ?? 0,
        monthlyWhatsAppClicks: monthly.products.get(product.id)?.whatsappClicks ?? 0,
      };
    }),
    metrics: {
      totalViews: monthly.totalViews,
      productViews: monthly.productViews,
      whatsappClicks: monthly.whatsappClicks,
    },
  };
}

export function serializePromotion(promotion: db.PromotionWithNames) {
  return {
    id: promotion.id, productId: promotion.product_id, productName: promotion.product_name,
    storeName: promotion.store_name, position: promotion.requested_position,
    placementScope: promotion.placement_scope, placementCategory: promotion.placement_category,
    durationDays: promotion.duration_days, amount: promotion.amount_cents / 100,
    status: promotion.status, paymentId: promotion.mp_payment_id,
    paymentStatus: promotion.mp_payment_status, paidAt: promotion.paid_at,
    startsAt: promotion.starts_at, endsAt: promotion.ends_at, createdAt: promotion.created_at,
  };
}

export function serializeStorePromotion(promotion: db.StorePromotionRow & { store_name?: string; store_region?: string; store_slug?: string | null; store_logo_url?: string | null }) {
  return {
    id: promotion.id,
    storeId: promotion.store_id,
    storeName: promotion.store_name,
    storeRegion: promotion.store_region,
    storeSlug: promotion.store_slug ?? null,
    storeLogoUrl: promotion.store_logo_url ?? null,
    position: promotion.requested_position,
    placementScope: promotion.placement_scope,
    placementCategory: promotion.placement_category,
    durationDays: promotion.duration_days,
    amount: promotion.amount_cents / 100,
    status: promotion.status,
    startsAt: promotion.starts_at,
    endsAt: promotion.ends_at,
    createdAt: promotion.created_at,
  };
}

/** Junta as linhas de confirmação em pedidos: uma finalização pode ter vários itens. */
export function groupOrders(items: db.OrderItemRow[], states: db.OrderStateRow[]) {
  const stateByOrder = new Map(states.map((state) => [state.order_id, state]));
  const orders = new Map<string, {
    id: string; createdAt: number; buyerName: string | null; buyerWhatsapp: string | null;
    fulfillmentMethod: string; fulfillmentLabel: string; shippingFee: number | null;
    productAmount: number; co2Kg: number;
    items: Array<{ productId: string; name: string; quantity: number; amount: number; addons: db.ProductAddon[] }>;
  }>();
  for (const item of items) {
    // Linhas antigas não tinham order_id: cada uma vira um pedido de um item.
    const key = item.order_id ?? item.id;
    const order = orders.get(key) ?? {
      id: key,
      createdAt: item.created_at,
      buyerName: item.buyer_name,
      buyerWhatsapp: item.buyer_whatsapp,
      fulfillmentMethod: item.fulfillment_method,
      fulfillmentLabel: FULFILLMENT_LABELS[item.fulfillment_method] ?? item.fulfillment_method,
      shippingFee: null as number | null,
      productAmount: 0,
      co2Kg: 0,
      items: [] as Array<{ productId: string; name: string; quantity: number; amount: number; addons: db.ProductAddon[] }>,
    };
    order.productAmount += item.product_amount_cents / 100;
    order.co2Kg += Math.max(0, item.co2_g) / 1000;
    // O frete fica gravado no primeiro item do pedido; null significa "a combinar".
    if (item.shipping_fee_cents !== null && item.shipping_fee_cents > 0) order.shippingFee = item.shipping_fee_cents / 100;
    else if (item.shipping_fee_cents === null) order.shippingFee = null;
    order.items.push({
      productId: item.product_id,
      name: item.product_name,
      quantity: item.quantity,
      amount: item.product_amount_cents / 100,
      addons: parseProductAddons(item.selected_addons),
    });
    orders.set(key, order);
  }
  return [...orders.values()].map((order) => {
    const state = stateByOrder.get(order.id);
    return {
      ...order,
      total: order.shippingFee === null ? null : order.productAmount + order.shippingFee,
      // Sem marcação do vendedor, o pedido segue como "informado pelo comprador".
      status: state?.status ?? "reported",
      paidAt: state?.paid_at ?? null,
      deliveredAt: state?.delivered_at ?? null,
      stockApplied: Boolean(state?.stock_applied),
    };
  });
}
