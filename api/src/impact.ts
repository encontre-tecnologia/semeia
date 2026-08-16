/**
 * Estimativa comparativa de ciclo de vida do Semeia.
 *
 * Este modelo não é uma certificação nem uma medição da propriedade. Ele compara
 * dois cenários para a mesma quantidade de alimento:
 *   - equivalente convencional, com cadeia de distribuição mais longa;
 *   - produto local informado pelo vendedor.
 *
 * Para não prometer um benefício que os dados não sustentam, cultivo sem
 * agrotóxicos não reduz automaticamente o CO2e. Essa prática é exibida como um
 * benefício ambiental separado. A produção agrícola é mantida igual nos dois
 * cenários; a diferença vem de processamento, embalagem, refrigeração,
 * distribuição e última milha.
 */

export type ProductType =
  | "leafy_vegetables"
  | "vegetables"
  | "fruit"
  | "roots"
  | "grains"
  | "bread"
  | "eggs"
  | "milk"
  | "cheese"
  | "prepared_food"
  | "other_food"
  | "not_applicable";

export type Processing = "fresh" | "minimal" | "processed";
export type Packaging = "none" | "paper" | "plastic" | "glass";
export type DeliveryMethod = "pickup" | "grouped" | "dedicated";

export interface ImpactProfile {
  productType: ProductType;
  weightKg: number;
  processing: Processing;
  packaging: Packaging;
  refrigerated: boolean;
  deliveryMethod: DeliveryMethod;
  pesticideFree: boolean;
}

interface ProductBaseline {
  /** Cenário convencional indicativo, em kg CO2e por kg de produto. */
  kgCo2ePerKg: number;
  /** Parcela atribuída à produção; não recebe desconto no cenário Semeia. */
  productionShare: number;
  label: string;
}

const BASELINES: Record<ProductType, ProductBaseline> = {
  leafy_vegetables: { kgCo2ePerKg: 0.7, productionShare: 0.72, label: "hortaliças e folhas" },
  vegetables: { kgCo2ePerKg: 0.9, productionShare: 0.72, label: "legumes e verduras" },
  fruit: { kgCo2ePerKg: 0.8, productionShare: 0.70, label: "frutas" },
  roots: { kgCo2ePerKg: 0.5, productionShare: 0.70, label: "raízes e tubérculos" },
  grains: { kgCo2ePerKg: 1.8, productionShare: 0.75, label: "grãos e farinhas" },
  bread: { kgCo2ePerKg: 1.4, productionShare: 0.60, label: "pães e massas" },
  eggs: { kgCo2ePerKg: 4.5, productionShare: 0.88, label: "ovos" },
  milk: { kgCo2ePerKg: 3.2, productionShare: 0.86, label: "leite" },
  cheese: { kgCo2ePerKg: 21, productionShare: 0.88, label: "queijos" },
  prepared_food: { kgCo2ePerKg: 3, productionShare: 0.65, label: "alimentos preparados" },
  other_food: { kgCo2ePerKg: 1.5, productionShare: 0.75, label: "outros alimentos" },
  not_applicable: { kgCo2ePerKg: 0, productionShare: 0, label: "produto não alimentício" },
};

const PROCESSING_RATIO: Record<Processing, number> = { fresh: 0.12, minimal: 0.5, processed: 1 };
const PACKAGING_RATIO: Record<Packaging, number> = { none: 0.05, paper: 0.42, plastic: 1, glass: 1.35 };
const DELIVERY_KG_CO2E_PER_ORDER: Record<DeliveryMethod, number> = {
  pickup: 0.05,
  grouped: 0.15,
  dedicated: 1.25,
};

const DEFAULT_WEIGHT_BY_UNIT: Record<string, number> = {
  "/kg": 1,
  "/un": 0.5,
  "/cesta": 5,
  "/pacote": 0.5,
  "/caixa": 8,
};

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = Object.fromEntries(
  Object.entries(BASELINES).map(([key, value]) => [key, value.label]),
) as Record<ProductType, string>;

export function isProductType(value: string): value is ProductType {
  return value in BASELINES;
}

export function isProcessing(value: string): value is Processing {
  return value in PROCESSING_RATIO;
}

export function isPackaging(value: string): value is Packaging {
  return value in PACKAGING_RATIO;
}

export function isDeliveryMethod(value: string): value is DeliveryMethod {
  return value in DELIVERY_KG_CO2E_PER_ORDER;
}

export function defaultWeightKg(unit: string): number {
  return DEFAULT_WEIGHT_BY_UNIT[unit] ?? 0.5;
}

export function inferProductType(name: string, category: string): ProductType {
  const value = `${name} ${category}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches: Array<[ProductType, RegExp]> = [
    ["cheese", /queijo|requeijao|mussarela|muçarela/],
    ["milk", /leite|iogurte/],
    ["eggs", /\bovo|\bovos/],
    ["bread", /pao|padaria|massa|bolo|biscoito/],
    ["grains", /grao|feijao|arroz|milho|farinha|aveia/],
    ["roots", /batata|mandioca|inhame|cará|beterraba|cenoura/],
    ["fruit", /fruta|laranja|limao|maca|banana|manga|pera|morango|uva/],
    ["leafy_vegetables", /folha|alface|couve|rucula|espinafre|hortifruti/],
    ["vegetables", /legume|verdura|tomate|brocolis|abobora|pepino|pimentao/],
    ["prepared_food", /preparado|conserva|geleia|molho|refeicao/],
  ];
  const foodMatch = matches.find(([, pattern]) => pattern.test(normalizedName))
    ?? matches.find(([, pattern]) => pattern.test(value));
  if (foodMatch) return foodMatch[0];
  if (/cosmetico|artesanato|marcenaria|reuso|compostagem|moda/.test(value)) return "not_applicable";
  return "other_food";
}

export interface ImpactEstimate {
  method: "comparative_lifecycle_v1";
  confidence: "low" | "medium";
  productType: ProductType;
  productTypeLabel: string;
  weightKg: number;
  conventionalKg: number;
  localKg: number;
  savingsKg: number;
  deliveryCanReverseBenefit: boolean;
  pesticideFree: boolean;
  breakdown: {
    productionKg: number;
    processingSavedKg: number;
    packagingSavedKg: number;
    coldChainSavedKg: number;
    distributionSavedKg: number;
    deliveryEmissionsKg: number;
  };
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function estimateLifecycleSavings(profile: ImpactProfile): ImpactEstimate {
  const baseline = BASELINES[profile.productType];
  const conventionalKg = baseline.kgCo2ePerKg * profile.weightKg;
  const productionKg = conventionalKg * baseline.productionShare;
  const postFarmKg = conventionalKg - productionKg;

  // Divisão transparente do trecho pós-produção do cenário convencional.
  const conventionalProcessing = postFarmKg * 0.35;
  const conventionalPackaging = postFarmKg * 0.20;
  const conventionalColdChain = postFarmKg * 0.20;
  const conventionalDistribution = postFarmKg * 0.25;

  const localProcessing = conventionalProcessing * PROCESSING_RATIO[profile.processing];
  const localPackaging = conventionalPackaging * PACKAGING_RATIO[profile.packaging];
  const localColdChain = conventionalColdChain * (profile.refrigerated ? 1 : 0.1);
  // Cadeia curta ainda tem transporte; o cenário local conserva 35% da distribuição convencional.
  const localDistribution = conventionalDistribution * 0.35;
  const deliveryEmissionsKg = DELIVERY_KG_CO2E_PER_ORDER[profile.deliveryMethod];

  const localKg = productionKg + localProcessing + localPackaging + localColdChain
    + localDistribution + deliveryEmissionsKg;
  const rawSavings = conventionalKg - localKg;

  return {
    method: "comparative_lifecycle_v1",
    confidence: profile.productType === "other_food" || profile.productType === "not_applicable" ? "low" : "medium",
    productType: profile.productType,
    productTypeLabel: PRODUCT_TYPE_LABELS[profile.productType],
    weightKg: rounded(profile.weightKg),
    conventionalKg: rounded(conventionalKg),
    localKg: rounded(localKg),
    savingsKg: rounded(Math.max(0, rawSavings)),
    deliveryCanReverseBenefit: rawSavings <= 0,
    pesticideFree: profile.pesticideFree,
    breakdown: {
      productionKg: rounded(productionKg),
      processingSavedKg: rounded(conventionalProcessing - localProcessing),
      packagingSavedKg: rounded(conventionalPackaging - localPackaging),
      coldChainSavedKg: rounded(conventionalColdChain - localColdChain),
      distributionSavedKg: rounded(conventionalDistribution - localDistribution),
      deliveryEmissionsKg: rounded(deliveryEmissionsKg),
    },
  };
}
