-- Registro de e-mail que não saiu.
--
-- O aviso de pedido depende de um segredo do Gmail. Quando ele expira, o
-- vendedor simplesmente não fica sabendo do pedido — e as unidades ficam
-- reservadas 24h à toa. Sem esta tabela, a falha só existia no log.
CREATE TABLE IF NOT EXISTS email_failures (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  store_id TEXT,
  recipient TEXT,
  error TEXT NOT NULL,
  skipped INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_failures_created ON email_failures (created_at DESC);
