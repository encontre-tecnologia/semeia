# Legado — checkout por Mercado Pago

Guardado aqui, fora do caminho de compilação, o código do tempo em que o
pagamento passava pela plataforma. Nada disso roda hoje: o Semeia é mediador,
o Pix vai direto do comprador para o vendedor e o destaque é conferido à mão.

Como o projeto não está em git, o código fica como texto em vez de ser apagado.

| Arquivo | O que era |
|---|---|
| `mercadopago.ts.txt` | Integração com a API do Mercado Pago: OAuth da loja, criação de preferência e leitura de pagamento. |
| `db-orders.ts.txt` | `insertOrder`, `markOrderStatus`, `getOrder`, `attachPreference` e os tipos da tabela `orders`. |

A tabela `orders` continua no banco, vazia (0 linhas), e não é mais lida por
nenhuma consulta — inclusive as de impacto, que agora somam só
`direct_purchase_confirmations`. Apagar a tabela é seguro, mas ficou de fora
por ser irreversível.

As rotas `/api/checkout`, `/api/orders/:id`, `/api/oauth/*` e
`/api/webhooks/mercadopago` continuam no Worker de propósito: respondem 410
explicando que a função saiu do ar. São lápides, não código vivo — se alguém
tiver um link antigo, recebe uma explicação em vez de um 404 mudo.
