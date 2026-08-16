/**
 * Semeia — utilitários de criptografia.
 *
 * Os tokens OAuth dos vendedores dão acesso à conta Mercado Pago deles.
 * Por isso nunca são gravados em texto puro no Postgres: passam por AES-GCM
 * com uma chave que vive só como secret do Worker.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Criptografa um token para guardar no banco. Retorna base64 de `iv || ciphertext`. */
export async function encryptToken(plaintext: string, secret: string): Promise<string> {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(packed);
}

/** Reverte `encryptToken`. Lança se a chave estiver errada ou o dado foi adulterado. */
export async function decryptToken(payload: string, secret: string): Promise<string> {
  const packed = fromBase64(payload);
  if (packed.length <= IV_BYTES) throw new Error("payload criptografado inválido");

  const key = await deriveAesKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.subarray(0, IV_BYTES) },
    key,
    packed.subarray(IV_BYTES),
  );
  return decoder.decode(plaintext);
}

/**
 * Compara dois segredos sem vazar informação pelo tempo de execução.
 * Compara os hashes, então funciona mesmo com strings de tamanhos diferentes.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(hashA, hashB);
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(signature);
}

export { hmacHex };

/**
 * O parâmetro `state` do OAuth precisa ser inforjável — sem isso, alguém pode
 * induzir a conexão de uma conta Mercado Pago à loja errada (CSRF).
 * Formato: `<storeId>.<emitidoEm>.<hmac>`
 */
export async function signState(storeId: string, secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = `${storeId}.${issuedAt}`;
  return `${body}.${await hmacHex(body, secret)}`;
}

const STATE_MAX_AGE_SECONDS = 15 * 60;

/** Devolve o storeId se o state for válido e recente; caso contrário, null. */
export async function verifyState(state: string, secret: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const [storeId, issuedAtRaw, signature] = parts as [string, string, string];
  const expected = await hmacHex(`${storeId}.${issuedAtRaw}`, secret);
  if (!(await safeEqual(signature, expected))) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Math.floor(Date.now() / 1000) - issuedAt > STATE_MAX_AGE_SECONDS) return null;

  return storeId;
}

const SETUP_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Link temporário entregue somente a quem acabou de cadastrar a loja. */
export async function signSetupToken(storeId: string, secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = `${storeId}.${issuedAt}`;
  return `${body}.${await hmacHex(`setup:${body}`, secret)}`;
}

export async function verifySetupToken(
  token: string,
  expectedStoreId: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [storeId, issuedAtRaw, signature] = parts as [string, string, string];
  if (storeId !== expectedStoreId) return false;
  const expected = await hmacHex(`setup:${storeId}.${issuedAtRaw}`, secret);
  if (!(await safeEqual(signature, expected))) return false;
  const issuedAt = Number(issuedAtRaw);
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  return Number.isFinite(issuedAt) && age >= 0 && age <= SETUP_MAX_AGE_SECONDS;
}
