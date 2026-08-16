# Semeia

Vitrine local de produtos sustentáveis — catálogo de lojas com selo ambiental,
contato direto com o vendedor pelo WhatsApp e indicadores de impacto.

> Estado atual: o Semeia não recebe nem processa pagamentos. Pagamento, retirada
> e entrega são combinados diretamente entre comprador e vendedor.

O projeto tem duas partes:

- **Site** (esta pasta) — HTML/CSS/JS puro, sem build.
- **API** (`api/`) — Cloudflare Workers + D1. Veja [api/README.md](api/README.md).

## Estrutura

```
index.html, produto.html, …   páginas do site (HTML/CSS/JS puro, sem build)
assets/                       CSS, imagens e os módulos JS compartilhados
  api.js       chamadas à API          cart.js     sacola no localStorage
  pix.js       geração do código Pix   notice.js   pop-ups de aviso
  main.js      utilitários de tela     security.js Turnstile
api/src/                      Worker (Cloudflare + D1)
  index.ts     rotas                   db.ts       todas as consultas SQL
  parsing.ts   validação e leitura     serializers.ts  banco → JSON da API
  pricing.ts   preços dos destaques    impact.ts   estimativa de CO₂
  email.ts     e-mails transacionais   gmail.ts    transporte
deploys/                      pastas já publicadas (artefato, não editar)
*-preview-test.html           cópias das páginas com a API simulada, para teste local
```

## Como abrir

**Só o site** (usa os dados de demonstração de `assets/data.js`):

```bash
npx serve . -l 8744
```

**Site + API** (dados reais do banco, cadastro e checkout funcionando):

```bash
cd api && npm install && npm run db:init:local && npm run db:seed:local && npm run dev
```

Depois, em outro terminal, sirva o site em `http://localhost:8744` — é a porta
já liberada no CORS da API.

O site detecta sozinho se a API está no ar. Se não estiver, ele continua
funcionando com os dados locais e mantém o aviso de "números ilustrativos".

> **Não abra os HTML com duplo clique.** No protocolo `file://` o navegador trata
> cada arquivo como uma origem isolada e bloqueia qualquer chamada de rede, então
> a API nunca conecta. O site ainda aparece (com os dados de demonstração), mas
> cadastro e checkout não funcionam. Use sempre um servidor, como acima.

## Páginas

- `index.html` — home: hero animado, contador de impacto, grid de produtos com
  busca e filtros por categoria e selo.
- `produto.html?id=<id>` — página de produto. "Comprar agora" abre o checkout;
  com a API e o Mercado Pago conectados, leva ao pagamento real. Sem isso, cai
  num modo de demonstração que avisa que nada foi cobrado.
- `cadastro-loja.html` — cadastro de loja. Com a API no ar, grava no banco como
  `pending`; sem ela, envia por e-mail como no piloto original.

## O que é real vs. simulado

**Real:**
- Busca e filtros por categoria, selo e região.
- Cadastro de loja gravado no banco (com API) ou enviado por e-mail (sem API).
- Contador de impacto calculado a partir das compras efetivamente pagas.
- Toda a mecânica de checkout: pedido no banco, preferência no Mercado Pago com
  `marketplace_fee`, e confirmação por webhook com assinatura verificada.

**Simulado:**
- As 12 lojas e produtos do `seed.sql` (e do `assets/data.js`).
- As compras `demo-001`…`demo-010` do `seed.sql`, que existem só para o contador
  não aparecer zerado. Apague antes de mostrar o site como real.
- O pagamento em si, enquanto nenhuma loja tiver conta Mercado Pago conectada.

## O que ainda falta

- Painel para o vendedor cadastrar os próprios produtos (hoje só via SQL).
- Cobrança da mensalidade de R$ 30 do plano `raiz`.
- Termos de uso deixando claro que frete, entrega e garantia são do vendedor.

Detalhes técnicos e passos de publicação: [api/README.md](api/README.md).
