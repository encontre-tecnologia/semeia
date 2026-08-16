# Semeia API — Workers + D1

Backend da vitrine com catálogo, cadastro e moderação de lojas e produtos.

> Estado atual: pagamentos estão desativados. A rota `/api/checkout` responde
> com `410 Gone`; o comprador conversa diretamente com o vendedor pelo WhatsApp.
> O código antigo de Mercado Pago permanece isolado apenas como referência para
> uma possível fase futura e não é utilizado pelo site.

## Endereços publicados

- Site: `https://semeia-51k.pages.dev`
- API: `https://semeia-api.encontretecnologia2.workers.dev`
- OAuth callback: `https://semeia-api.encontretecnologia2.workers.dev/api/oauth/callback`
- Webhook: `https://semeia-api.encontretecnologia2.workers.dev/api/webhooks/mercadopago`

## Como o dinheiro é dividido

1. O vendedor cadastra a loja e autoriza o Semeia pelo OAuth do Mercado Pago.
2. Os tokens são criptografados antes de serem gravados no D1.
3. Na compra, o preço e o vendedor são buscados no banco — o navegador não envia o valor.
4. A preferência é criada com o token do vendedor e `marketplace_fee`.
5. O Mercado Pago direciona o líquido ao vendedor e a comissão ao Semeia.
6. Somente o webhook assinado confirma o pedido como pago.

## Configuração que ainda precisa ser feita no Mercado Pago

1. Configurar a aplicação como **Checkout Pro / Marketplace**.
2. Cadastrar o OAuth callback listado acima como **Redirect URL**.
3. Criar um webhook de pagamentos usando a URL listada acima.
4. Definir os dois segredos sem colocá-los em arquivo ou no frontend:

   ```powershell
   npx wrangler secret put MP_CLIENT_SECRET
   npx wrangler secret put MP_WEBHOOK_SECRET
   ```

5. Trocar o token administrativo por um valor conhecido e forte:

   ```powershell
   npx wrangler secret put ADMIN_TOKEN
   ```

O `TOKEN_ENCRYPTION_KEY` já existe no Worker. Não troque essa chave depois que
vendedores reais forem conectados, pois os tokens existentes deixariam de ser
decifráveis.

## E-mails para lojistas (boas-vindas e aprovação)

Dois e-mails automáticos, escritos em `src/email.ts`: um no cadastro da loja e
outro quando o admin muda o status para `approved`. O transporte é a API do
Gmail (`src/gmail.ts`) — é o único caminho gratuito que chega na caixa de
entrada sem domínio próprio, já que desde 2024 o `gmail.com` publica DMARC
`p=quarantine` e mandar "de" um @gmail.com através de Brevo/Resend cai no spam.

Fica desligado enquanto `EMAIL_FROM` estiver vazio ou os segredos não
existirem — o cadastro e a aprovação funcionam normalmente sem isso.

Para ligar:

1. No [Google Cloud Console](https://console.cloud.google.com/), no projeto do
   Firebase (`semeia-a7cd2`) ou em um novo: habilite a **Gmail API** e crie um
   **OAuth client ID** do tipo *Web application* com
   `http://localhost:5580` em *Authorized redirect URIs*. Se a tela de
   consentimento estiver em modo *Testing*, adicione a conta que vai enviar
   como *Test user*.

   Importante: clique em **Publish app** na aba *Audience*. Em status
   *Testing*, o refresh token expira em 7 dias.

2. Rode o script — ele faz o resto (autoriza, descobre o endereço, grava os
   três segredos, preenche `EMAIL_FROM` e faz o deploy):

   ```powershell
   node scripts/gmail-auth.mjs <CLIENT_ID> <CLIENT_SECRET>
   ```

   O refresh token não é impresso nem gravado em arquivo: vai direto para o
   `wrangler secret put`. Use `--no-deploy` para parar antes do deploy.

Limite prático da conta Google: ~500 mensagens por dia. Os envios acontecem em
`waitUntil` e qualquer falha é apenas logada (`event: email_failed`), para que
um problema de e-mail nunca invalide o cadastro de uma loja.

## Desenvolvimento local

```powershell
npm install
npm run cf-typegen
npm run db:migrate:local
npx wrangler d1 execute semeia-db --local --file seed.demo.sql
npm run dev
```

Os segredos locais ficam em `.dev.vars`, que está ignorado pelo Git. Use
`.dev.vars.example` como referência.

## Banco D1

```powershell
# aplicar novas migrações localmente
npm run db:migrate:local

# aplicar novas migrações no banco publicado
npm run db:migrate:remote
```

`seed.demo.sql` contém apenas uma loja e um produto fictícios para demonstrar o
bloqueio de checkout antes da conexão OAuth. Não representa um vendedor real.

## Rotas públicas

| Método | Rota | Função |
|---|---|---|
| GET | `/api/health` | Estado da API, D1 e configuração de pagamento |
| GET | `/api/products` | Lista produtos aprovados |
| GET | `/api/products/:id` | Busca um produto |
| GET | `/api/impact` | Totais de impacto confirmados |
| POST | `/api/stores` | Cadastra loja e devolve link temporário de OAuth |
| GET | `/api/oauth/connect` | Inicia autorização do vendedor |
| GET | `/api/oauth/callback` | Salva tokens OAuth criptografados |
| POST | `/api/checkout` | Cria pedido e preferência com `marketplace_fee` |
| GET | `/api/orders/:id` | Consulta o status do pedido |
| POST | `/api/webhooks/mercadopago` | Confirma pagamento após validar assinatura |

Rotas administrativas exigem `Authorization: Bearer ADMIN_TOKEN`:

| Método | Rota | Função |
|---|---|---|
| GET | `/api/admin/stores?status=` | Lista lojas |
| POST | `/api/admin/stores/:id/status` | Aprova ou suspende uma loja |
| POST | `/api/admin/stores/:id/plan` | Define plano/comissão |
| POST | `/api/admin/products` | Cadastra um produto com preço em centavos |

## Comissão atual

| Plano | Mensalidade | Comissão |
|---|---:|---:|
| `semente` | R$ 0 | 8% por venda |
| `raiz` | ainda não implementada | 3% por venda |

O backend transforma a porcentagem em valor monetário e envia esse valor em
`marketplace_fee`. As tarifas próprias do Mercado Pago são separadas.

## Segurança implementada

- AES-GCM para tokens OAuth em repouso.
- `state` OAuth assinado e com expiração de 15 minutos.
- Link inicial de conexão assinado e válido por sete dias.
- Assinatura `x-signature` validada no webhook.
- Comparação temporalmente segura para segredos.
- Preços armazenados como inteiros em centavos.
- Checkout usa produto e vendedor vindos do D1.
- O retorno do navegador nunca marca um pedido como pago.

## Antes de aceitar dinheiro real

- Concluir os dois segredos do Mercado Pago.
- Usar contas e cartões de teste para validar OAuth, compra, rejeição e estorno.
- Criar termos para comissão, entrega, garantia, cancelamento e reembolso.
- Validar emissão de nota fiscal da comissão com contabilidade.
