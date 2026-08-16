# Semeia

Vitrine local que aproxima compradores de pequenos negócios, produtores e lojas
de São Carlos - SP. Cada loja tem página própria, catálogo com foto e preço, e a
conversa acontece direto no WhatsApp de quem vende.

**No ar:** https://semeiabr.com

> O Semeia não recebe, não guarda e não repassa o dinheiro da compra. O Pix vai
> direto para o vendedor; frete, entrega e garantia são responsabilidade dele.
> Isso está escrito nos [Termos de uso](termos.html) e dito na tela ao comprador.

O projeto tem duas partes:

- **Site** (esta pasta) — HTML/CSS/JS puro, sem build, publicado no Cloudflare Pages.
- **API** (`api/`) — Cloudflare Workers + D1. Veja [api/README.md](api/README.md).

## Estrutura

```
index.html, produto.html, …   as 14 páginas (HTML/CSS/JS puro, sem build)
assets/                       CSS, imagens e os módulos JS compartilhados
  api.js       chamadas à API          cart.js     sacola no localStorage
  pix.js       geração do código Pix   notice.js   pop-ups de aviso
  main.js      menu, rodapé, sessão    security.js Turnstile
  format.js    preço, frete e CO₂      seo.js      título e dados estruturados
  data.js      categorias do catálogo  config.js   endereço da API
api/src/                      Worker (Cloudflare + D1)
  index.ts     rotas                   db.ts       todas as consultas SQL
  parsing.ts   validação e leitura     serializers.ts  banco → JSON da API
  pricing.ts   preços dos destaques    impact.ts   estimativa de CO₂
  email.ts     e-mails transacionais   gmail.ts    transporte
api/migrations/               esquema do D1, aplicado em ordem
scripts/deploy-pages.ps1      publica o site (copia para deploys/ e sobe)
deploys/                      cópias das publicações (artefato, não editar)
```

## Como abrir

**Só o site:**

```bash
npx serve . -l 8744
```

**Site + API:**

```bash
cd api && npm install && npm run db:migrate:local && npm run dev
```

Depois sirva o site em `http://localhost:8744` — é a porta já liberada no CORS
da API. Para apontar o site local contra a API local, rode no console do
navegador `localStorage.setItem("semeia-api-url", "http://localhost:8787")`.

> **Não abra os HTML com duplo clique.** No protocolo `file://` o navegador trata
> cada arquivo como origem isolada e bloqueia as chamadas de rede. Use sempre um
> servidor, como acima.

## Páginas

| Página | O que faz |
|---|---|
| `index.html` | home: catálogo com busca, filtros e contador de impacto |
| `produto.html?id=` | produto, com frete, retirada, estimativa de CO₂ e compra |
| `loja.html?id=` | vitrine da loja: capa, horários, contato e catálogo |
| `carrinho.html` · `checkout.html` | sacola e fechamento do pedido |
| `cadastro-loja.html` | entrada de uma loja nova (fica pendente até aprovação) |
| `minha-loja.html` | painel do lojista: produtos, estoque, pedidos e métricas |
| `cadastro-produto.html` · `editar-fotos.html` | publicar e editar anúncio |
| `admin.html` | moderação: aprovar loja, liberar destaque, ver falhas de e-mail |
| `beneficios.html` · `convite.html` · `privacidade.html` · `termos.html` | conteúdo |

## Como funciona hoje

**Compra.** O comprador escolhe retirada ou entrega, vê o frete e finaliza. O
pedido é registrado, o estoque fica **reservado por 24 horas** e o vendedor
recebe um e-mail. Se ninguém confirmar, um cron horário devolve as unidades ao
catálogo. O pagamento é combinado entre as duas partes, por Pix.

**Frete.** O vendedor escolhe como cobra: por faixa de distância (o comprador
seleciona a dele e o valor entra no total) ou escrevendo a regra com as próprias
palavras — "Centro e Vila Nery — R$ 8,00", "R$ 1,00 por km rodado" —, e aí o
valor é acertado na conversa.

**Estoque.** Contado em unidades ou marcado como *sob encomenda*, para quem faz
conforme o pedido — pão, ovo do dia, marmita. Sob encomenda não entra na reserva.

**Impacto.** Cada produto traz uma estimativa de CO₂ comparando a cadeia local
com um equivalente convencional. É comparativa e educativa, nunca auditada — e o
texto na tela diz isso.

**Moderação.** Loja nova entra como `pending` e não aparece no catálogo até ser
aprovada no `admin.html`. A administração recebe e-mail quando há loja ou
destaque esperando.

**Destaques.** Posições 1 a 5 na home e nas categorias. Gratuitos durante o
piloto (`PROMOTION_FREE_DURING_PILOT` em `api/src/pricing.ts`).

## Piloto

O Semeia atende **só São Carlos - SP** (`SERVED_REGIONS` em
`api/src/parsing.ts`). Um cadastro de outra cidade é recusado com um convite
para conversar. A ideia é densidade antes de espalhamento: quem chega pela loja A
precisa encontrar a B e a C por perto.

## Publicar

```bash
powershell -NoProfile -Command "& '.\scripts\deploy-pages.ps1' -Theme nome-da-mudanca"
cd api && npx wrangler deploy
```

> Edite arquivos com Python ou com o editor — **não** com `Get-Content` /
> `Set-Content` do PowerShell 5.1: ele lê UTF-8 como cp1252 e corrompe todos os
> acentos do arquivo.

Migrações de banco: `cd api && npm run db:migrate:remote`.

## Dependências externas

| Serviço | Para quê |
|---|---|
| Cloudflare Pages + Workers + D1 | site, API e banco |
| Cloudinary | fotos de produto e logos |
| Firebase Auth | login do lojista com Google |
| Gmail API | e-mails transacionais |
| Turnstile | proteção contra cadastro automático |

Detalhes técnicos, segredos e publicação da API: [api/README.md](api/README.md).
