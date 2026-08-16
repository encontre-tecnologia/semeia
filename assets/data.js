// Semeia — dados compartilhados (fictícios, para protótipo/validação)

var CATS = {
  "hortifruti": { label: "Hortifruti", shortLabel: "Hortifruti", icon: "🥬", tint: "#8FA65B" },
  "sucos-naturais": { label: "Sucos naturais", shortLabel: "Sucos", icon: "🍹", tint: "#D8A84E" },
  "bolos-caseiros": { label: "Bolos caseiros", shortLabel: "Bolos", icon: "🍰", tint: "#C98B65" },
  "lanches-naturais": { label: "Lanches naturais", shortLabel: "Lanches", icon: "🥪", tint: "#A7A85E" },
  "paes-artesanais": { label: "Pães artesanais", shortLabel: "Pães", icon: "🥖", tint: "#C6A15B" },
  "doces-geleias": { label: "Doces e geleias", shortLabel: "Doces", icon: "🍯", tint: "#C97C6A" },
  "ovos-laticinios": { label: "Ovos e laticínios", shortLabel: "Ovos e laticínios", icon: "🥚", tint: "#D9C98B" },
  "mel-derivados": { label: "Mel e derivados", shortLabel: "Mel", icon: "🐝", tint: "#D6A83E" },
  "temperos-ervas": { label: "Temperos e ervas", shortLabel: "Temperos", icon: "🌿", tint: "#759B64" },
  "graos-cereais": { label: "Grãos e cereais", shortLabel: "Grãos", icon: "🌾", tint: "#B89A58" },
  "conservas": { label: "Conservas artesanais", shortLabel: "Conservas", icon: "🫙", tint: "#9A9A5E" },
  "cestas-kits": { label: "Cestas e kits", shortLabel: "Cestas", icon: "🧺", tint: "#A87C50" },
  "graos": { label: "Padaria e grãos", shortLabel: "Padaria", icon: "🥐", tint: "#C6A15B" },
  "cosmeticos": { label: "Cosméticos naturais", shortLabel: "Cosméticos", icon: "🧼", tint: "#B98FA0" },
  "artesanato": { label: "Artesanato e marcenaria", shortLabel: "Artesanato", icon: "🧶", tint: "#B08356" },
  "reuso": { label: "Reuso e compostagem", shortLabel: "Reuso", icon: "♻️", tint: "#7C9A92" },
  "moda": { label: "Moda circular", shortLabel: "Moda", icon: "🧵", tint: "#9B8AC4" }
};

var SEALS = {
  "organico": "Orgânico certificado",
  "comercio-justo": "Comércio justo",
  "carbono-neutro": "Carbono neutro",
  "reciclado": "Reciclado / upcycling",
  "local": "Produção local"
};

// co2kg = estimativa de CO2 evitado (kg) em relação a um equivalente convencional, por unidade comprada
var PRODUCTS = [
  {
    id: "cesta-vale-verde",
    name: "Caixa da Roça",
    supplier: "Coop. Vale Verde",
    cat: "hortifruti",
    price: 42,
    unit: "/cesta",
    region: "Zona Sul",
    seals: ["organico", "local"],
    co2kg: 2.4,
    desc: "Cesta semanal com o que estiver na safra — verduras, legumes e frutas da estação, colhidos a menos de 40km de distância.",
    whats: "5511999990001"
  },
  {
    id: "mel-serra-fria",
    name: "Mel silvestre 500g",
    supplier: "Apiário Serra Fria",
    cat: "hortifruti",
    price: 28,
    unit: "/un",
    region: "Região Metropolitana",
    seals: ["organico", "carbono-neutro"],
    co2kg: 0.6,
    desc: "Mel de floradas nativas, extraído sem aquecimento, de apiários que preservam mata ciliar ao redor das colmeias.",
    whats: "5511999990002"
  },
  {
    id: "pao-fermentacao-natural",
    name: "Pão de fermentação natural",
    supplier: "Padaria do Bairro",
    cat: "graos",
    price: 18,
    unit: "/un",
    region: "Centro",
    seals: ["local"],
    co2kg: 0.3,
    desc: "Fermentação lenta de 24h, farinha de moinho regional, forno a lenha reaproveitado de madeira de descarte.",
    whats: "5511999990003"
  },
  {
    id: "granola-grao-cru",
    name: "Granola artesanal",
    supplier: "Grão Cru",
    cat: "graos",
    price: 24,
    unit: "/400g",
    region: "Zona Norte",
    seals: ["comercio-justo", "local"],
    co2kg: 0.5,
    desc: "Aveia, castanhas e mel comprados direto de cooperativas familiares, sem intermediário.",
    whats: "5511999990004"
  },
  {
    id: "sabonete-botanica-viva",
    name: "Sabonete de aveia",
    supplier: "Botânica Viva",
    cat: "cosmeticos",
    price: 16,
    unit: "/un",
    region: "Zona Leste",
    seals: ["organico", "reciclado"],
    co2kg: 0.2,
    desc: "Saponificação a frio, óleos vegetais orgânicos, embalagem de papel semente que vira mudinha.",
    whats: "5511999990005"
  },
  {
    id: "shampoo-casca-raiz",
    name: "Shampoo sólido",
    supplier: "Casca & Raiz Cosméticos",
    cat: "cosmeticos",
    price: 32,
    unit: "/un",
    region: "Centro",
    seals: ["reciclado", "carbono-neutro"],
    co2kg: 1.1,
    desc: "Substitui até 3 frascos de shampoo líquido — menos plástico, menos peso no transporte, mesmo resultado.",
    whats: "5511999990006"
  },
  {
    id: "banqueta-reencontro",
    name: "Banqueta de madeira de demolição",
    supplier: "Marcenaria Reencontro",
    cat: "artesanato",
    price: 180,
    unit: "/un",
    region: "Zona Sul",
    seals: ["reciclado", "local"],
    co2kg: 8.4,
    desc: "Madeira resgatada de reformas e demolições, tratada e transformada à mão — cada peça é única.",
    whats: "5511999990007"
  },
  {
    id: "cestaria-mao-na-terra",
    name: "Cestaria de fibra de bananeira",
    supplier: "Ateliê Mão na Terra",
    cat: "artesanato",
    price: 65,
    unit: "/un",
    region: "Zona Norte",
    seals: ["comercio-justo", "local"],
    co2kg: 1.3,
    desc: "Fibra que seria descartada pela agricultura familiar, trançada por artesãs da região.",
    whats: "5511999990008"
  },
  {
    id: "composteira-ciclo-organico",
    name: "Composteira doméstica",
    supplier: "Ciclo Orgânico",
    cat: "reuso",
    price: 129,
    unit: "/kit",
    region: "Região Metropolitana",
    seals: ["carbono-neutro"],
    co2kg: 45,
    desc: "Kit completo com minhocas californianas — transforma resto de comida em adubo, longe do aterro.",
    whats: "5511999990009"
  },
  {
    id: "coleta-oleo-reversa",
    name: "Coleta de óleo usado",
    supplier: "Reversa Coletivo",
    cat: "reuso",
    price: 0,
    unit: "grátis",
    region: "Zona Leste",
    seals: ["reciclado", "carbono-neutro"],
    co2kg: 3.2,
    desc: "Coleta agendada de óleo de cozinha usado, virando biodiesel e sabão em parceria com cooperativas locais.",
    whats: "5511999990010"
  },
  {
    id: "camiseta-fio-circular",
    name: "Camiseta de algodão reciclado",
    supplier: "Fio Circular",
    cat: "moda",
    price: 59,
    unit: "/un",
    region: "Centro",
    seals: ["reciclado", "comercio-justo"],
    co2kg: 2.1,
    desc: "Fio feito de retalho industrial reprocessado — a mesma camiseta, com metade da água gasta pra fazer.",
    whats: "5511999990011"
  },
  {
    id: "sacola-retalho-novo",
    name: "Sacola de lona reaproveitada",
    supplier: "Retalho Novo",
    cat: "moda",
    price: 22,
    unit: "/un",
    region: "Zona Sul",
    seals: ["reciclado", "local"],
    co2kg: 0.4,
    desc: "Costurada a partir de banners e lonas de eventos que iriam para o descarte.",
    whats: "5511999990012"
  }
];
