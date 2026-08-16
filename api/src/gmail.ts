/**
 * Semeia — transporte de e-mail pela API do Gmail.
 *
 * Enviar pela infraestrutura do Google é o único caminho gratuito que chega na
 * caixa de entrada sem domínio próprio: desde 2024 o gmail.com publica DMARC
 * p=quarantine, então mandar "de" um @gmail.com através de um ESP (Brevo,
 * Resend...) cai no spam. Aqui o e-mail sai da própria conta Google.
 *
 * Configuração (uma vez):
 *   1. node scripts/gmail-auth.mjs   → gera o refresh token
 *   2. wrangler secret put GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN
 *   3. EMAIL_FROM no wrangler.jsonc = o endereço Gmail da conta autorizada
 *
 * Limite prático da conta: ~500 mensagens/dia.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface GmailMessage {
  to: string;
  fromName: string;
  subject: string;
  html: string;
  text: string;
}

/** Token de acesso vive ~1h; guardar por isolate evita um round-trip por e-mail. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export function gmailConfigured(env: Env): boolean {
  return Boolean(
    (env.EMAIL_FROM || "").trim() &&
    env.GMAIL_CLIENT_ID &&
    env.GMAIL_CLIENT_SECRET &&
    env.GMAIL_REFRESH_TOKEN,
  );
}

async function accessToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json<{ access_token?: string; expires_in?: number; error?: string; error_description?: string }>();
  if (!response.ok || !payload.access_token) {
    throw new Error(`OAuth do Gmail falhou: ${payload.error_description || payload.error || response.status}`);
  }
  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Utf8(value: string): string {
  return base64(new TextEncoder().encode(value));
}

/** Corpos em base64 precisam de linhas curtas para não estourar limite de MIME. */
function wrap(value: string): string {
  return (value.match(/.{1,76}/g) || []).join("\r\n");
}

/** Assunto com acento precisa de RFC 2047, senão chega como "Padrão". */
function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${base64Utf8(value)}?=`;
}

/** Exportada para inspeção/teste do MIME sem precisar enviar de verdade. */
export function buildMime(message: GmailMessage, from: string): string {
  const boundary = `semeia-${crypto.randomUUID()}`;
  return [
    `From: ${encodeHeader(message.fromName)} <${from}>`,
    `To: ${message.to}`,
    // Estas mensagens são transacionais. O Gmail adiciona o Message-ID no envio;
    // Reply-To mantém uma pessoa real acessível sem simular uma lista de marketing.
    `Reply-To: ${from}`,
    `Date: ${new Date().toUTCString()}`,
    "Content-Language: pt-BR",
    "Auto-Submitted: auto-generated",
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(base64Utf8(message.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(base64Utf8(message.html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Envia e devolve o id da mensagem no Gmail. Lança em qualquer falha. */
export async function sendViaGmail(env: Env, message: GmailMessage): Promise<string> {
  const from = (env.EMAIL_FROM || "").trim();
  const token = await accessToken(env);
  const raw = base64Utf8(buildMime(message, from))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(SEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const payload = await response.json<{ id?: string; error?: { message?: string; code?: number } }>();
  if (!response.ok || !payload.id) {
    // Token revogado ou expirado: descarta o cache para a próxima tentativa renovar.
    if (response.status === 401) cachedToken = null;
    throw new Error(`Gmail respondeu ${response.status}: ${payload.error?.message || "erro desconhecido"}`);
  }
  return payload.id;
}
