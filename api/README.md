# Semeia API — Workers + D1

Backend da vitrine: catálogo, cadastro e moderação de lojas, painel do lojista,
pedidos com reserva de estoque e e-mails transacionais.

> **O Semeia não processa pagamentos.** O Pix vai direto do comprador para o
> vendedor, combinado entre os dois pelo WhatsApp. As rotas antigas de
> pagamento respondem `410 Gone` e o código de Mercado Pago está fora do
> caminho de build, em `legado/`, só como referência.

## Endereços publicados

- Site: `https://semeiabr.com` (o antigo `semeia-51k.pages.dev` continua no ar)
- API: `https://semeia-api.encontretecnologia2.workers.dev`

## Como um pedido acontece

1. O comprador escolhe retirada ou entrega e finaliza no site.
2. `POST /api/impact/confirm` grava o pedido e **reserva o estoque**: a
   quantidade sai do catálogo por um `UPDATE` condicional, que só funciona se
   ainda houver unidades — é o que evita duas pessoas levarem a última.
3. O vendedor recebe um e-mail com os itens, o total e o WhatsApp de quem pediu.
4. Ele confirma ou cancela em `POST /api/store/orders/:id/status`.
5. Se ninguém confirmar em 24 horas, o cron horário (`releaseExpiredHolds`)
   devolve as unidades ao catálogo.

Produto **sob encomenda** (`stock_quantity NULL`) fica fora dessa mecânica: não
há quantidade pronta para reservar.

## Autenticação

| Quem | Como |
|---|---|
| Lojista | token do Firebase no corpo (`idToken`), conferido em `identitytoolkit` |
| Administração | `Authorization: Bearer <ADMIN_TOKEN>` **ou** conta Google listada em `ADMIN_EMAILS` |

A loja precisa estar `approved` para publicar produto ou pedir destaque — a API
recusa antes de qualquer gravação, e o site desabilita os botões para não deixar
ninguém preencher um formulário à toa.

## Rotas

**Públicas**

| Método | Rota | Função |
|---|---|---|
| GET | `/api/health` | estado da API, do D1 e do e-mail |
| GET | `/api/products` · `/api/products/:id` | catálogo e produto |
| GET | `/api/stores` · `/api/stores/:id` · `/api/stores/featured` | lojas e vitrine |
| GET | `/api/impact` | totais de impacto confirmados |
| POST | `/api/impact/confirm` | registra o pedido e reserva o estoque |
| POST | `/api/stores` | cadastra loja (entra como `pending`) |
| POST | `/api/metrics` · `/api/products/:id/view` | visitas e cliques |
| GET | `/api/promotions/prices` · `/api/store-promotions/prices` | tabela de destaques |

**Do lojista** (exigem `idToken`)

| Método | Rota | Função |
|---|---|---|
| POST | `/api/store/me` | painel: loja, produtos, pedidos e métricas |
| POST | `/api/store-products` | publica anúncio |
| POST | `/api/store-products/:id/detail` · `/update` · `/images` · `/delete` | edita anúncio |
| POST | `/api/store-products/:id/stock` | ajusta estoque (número, delta ou `null` = sob encomenda) |
| POST | `/api/store/orders/:id/status` · `/delete` | confirma, cancela ou apaga pedido |
| POST | `/api/store/profile` · `/logo` · `/cover` · `/pix` | dados da loja |
| POST | `/api/store/upload` | envia imagem ao Cloudinary |
| POST | `/api/store/promotions` · `/store-promotions` | pede destaque de produto ou de loja |

**Administrativas**

| Método | Rota | Função |
|---|---|---|
| GET | `/api/admin/stores` | lista lojas por status |
| POST | `/api/admin/stores/:id/status` | aprova ou suspende (dispara e-mail nas duas viradas) |
| POST | `/api/admin/stores/:id/email` | reenvia boas-vindas ou aprovação |
| GET/POST | `/api/admin/promotions` · `/store-promotions` | fila e liberação de destaques |
| GET | `/api/admin/email-failures` | e-mails que não saíram nos últimos 7 dias |
| GET | `/api/admin/impact` | números consolidados |

**Desativadas** (respondem `410`): `/api/checkout`, `/api/orders/:id`,
`/api/oauth/*`, `/api/webhooks/mercadopago`.

## E-mails

Escritos em `src/email.ts`, enviados pela API do Gmail (`src/gmail.ts`) — é o
único caminho gratuito que chega na caixa de entrada sem domínio próprio de
e-mail, já que desde 2024 o `gmail.com` publica DMARC `p=quarantine` e mandar
"de" um @gmail.com através de Brevo ou Resend cai no spam.

| Quando | Para quem |
|---|---|
| Cadastro da loja | lojista (boas-vindas, com o aviso sobre spam) |
| Loja aprovada | lojista, com o link da vitrine |
| Loja suspensa | lojista, explicando que nada foi apagado |
| Pedido novo | lojista, com itens, total e WhatsApp do comprador |
| Loja pendente · destaque pedido | administração (`ADMIN_EMAILS`) |

Tudo sai em `waitUntil`, depois da resposta. O que falha vira linha em
`email_failures` e aparece no `admin.html` — um e-mail travado nunca invalida um
cadastro nem impede uma aprovação.

Fica desligado enquanto `EMAIL_FROM` estiver vazio ou os segredos `GMAIL_*` não
existirem. Para ligar:

1. No [Google Cloud Console](https://console.cloud.google.com/), no projeto do
   Firebase (`semeia-a7cd2`): habilite a **Gmail API** e crie um **OAuth client
   ID** do tipo *Web application* com `http://localhost:5580` em *Authorized
   redirect URIs*. Clique em **Publish app** na aba *Audience* — em modo
   *Testing* o refresh token expira em 7 dias.
2. Rode o script, que autoriza, descobre o endereço, grava os três segredos,
   preenche `EMAIL_FROM` e publica:

   ```powershell
   node scripts/gmail-auth.mjs <CLIENT_ID> <CLIENT_SECRET>
   ```

   O refresh token não é impresso nem gravado em arquivo. Use `--no-deploy` para
   parar antes da publicação.

Limite prático da conta Google: ~500 mensagens por dia.

## Desenvolvimento local

```powershell
npm install
npm run cf-typegen
npm run db:migrate:local
npx wrangler d1 execute semeia-db --local --file seed.demo.sql   # opcional
npm run dev
```

Segredos locais ficam em `.dev.vars` (ignorado pelo Git); use
`.dev.vars.example` como referência. Para apontar o site local contra esta API,
rode no console do navegador:

```js
localStorage.setItem("semeia-api-url", "http://localhost:8787")
```

## Banco D1

`semeia-db` — SQLite gerenciado pela Cloudflare, ligado ao Worker por *binding*.
Todas as consultas ficam em `src/db.ts`; o esquema vive em `migrations/`, um
arquivo numerado por mudança.

```powershell
npm run db:migrate:local     # aplica no banco local
npm run db:migrate:remote    # aplica no banco publicado
```

Duas armadilhas do SQLite que já custaram caro aqui:

- **Não dá para alterar um `CHECK` com `ALTER TABLE`.** A migração `0029`
  precisou recriar duas tabelas para aceitar `amount_cents = 0` (destaque
  gratuito do piloto).
- **`DROP TABLE` leva os índices junto.** Foi o que aconteceu na `0029`, e a
  `0030` existe só para recriar os sete índices perdidos.

## Configuração

Variáveis em `wrangler.jsonc`:

| Nome | Para quê |
|---|---|
| `ALLOWED_ORIGIN` | origens liberadas no CORS, separadas por vírgula |
| `ADMIN_EMAILS` | quem entra no painel e recebe os avisos internos |
| `EMAIL_FROM` | conta Google que envia |
| `FIREBASE_PROJECT_ID` · `FIREBASE_WEB_API_KEY` | login do lojista |
| `CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_UPLOAD_PRESET` | envio de imagens |

Segredos (`npx wrangler secret put <NOME>`): `ADMIN_TOKEN`, `GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.

## Regras que valem a pena saber

- **Piloto só em São Carlos - SP** (`SERVED_REGIONS`, em `src/parsing.ts`). Outra
  cidade é recusada com um convite para conversar.
- **Destaques gratuitos** enquanto `PROMOTION_FREE_DURING_PILOT` for `true`
  (`src/pricing.ts`).
- **Preços sempre em centavos**, inteiros, nunca ponto flutuante.
- **Nome de imagem decidido no servidor**: o preset do Cloudinary deriva o
  endereço do nome do arquivo, e o site mandava sempre "produto.jpg" — todas as
  fotos caíam no mesmo lugar e uma sobrescrevia a outra.
- **Estimativa de CO₂** (`src/impact.ts`) é comparativa e educativa. O tipo do
  alimento é deduzido do nome e da categoria; o peso vem do conteúdo declarado.

## Publicar

```powershell
npm run typecheck
npx wrangler deploy
```

Logs em tempo real: `npx wrangler tail`.
