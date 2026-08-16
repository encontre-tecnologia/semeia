/**
 * Semeia — configura o envio de e-mail pelo Gmail de ponta a ponta.
 *
 * Um comando faz tudo: autoriza a conta, descobre o endereço autorizado, grava
 * os três segredos no Worker, preenche EMAIL_FROM no wrangler.jsonc e faz o
 * deploy. O refresh token nunca é impresso nem gravado em arquivo.
 *
 *   node scripts/gmail-auth.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Antes de rodar, no Google Cloud (projeto semeia-a7cd2):
 *   - Gmail API habilitada
 *   - Google Auth Platform configurada e com "Publish app" feito (senão o
 *     refresh token expira em 7 dias)
 *   - OAuth client "Web application" com http://localhost:5580 em
 *     Authorized redirect URIs
 *
 * Use --no-deploy para parar antes do deploy.
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REDIRECT_URI = "http://localhost:5580";
// gmail.send é o único acesso ao Gmail; "email" só serve para descobrir qual
// endereço foi autorizado (não dá acesso a mensagem nenhuma).
const SCOPE = "https://www.googleapis.com/auth/gmail.send email";
const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const skipDeploy = args.includes("--no-deploy");
const [clientId, clientSecret] = args.filter((arg) => !arg.startsWith("--"));

if (!clientId || !clientSecret) {
  console.error("Uso: node scripts/gmail-auth.mjs <CLIENT_ID> <CLIENT_SECRET> [--no-deploy]");
  process.exit(1);
}

/** Roda um comando mostrando a saída; devolve o código de saída. */
function run(command, commandArgs, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: API_DIR,
      shell: process.platform === "win32",
      stdio: [stdin === undefined ? "inherit" : "pipe", "inherit", "inherit"],
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(code) : reject(new Error(`${command} saiu com código ${code}`))));
  });
}

async function putSecret(name, value) {
  process.stdout.write(`\n→ gravando segredo ${name}\n`);
  await run("npx", ["wrangler", "secret", "put", name], `${value}\n`);
}

// ---------------------------------------------------------------- 1. consent ---

const consentUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Sem isto, uma conta já autorizada volta sem refresh_token.
    prompt: "consent",
  });

console.log("\n1. Abra esta URL, entre com a conta que vai enviar os e-mails e autorize:\n");
console.log(consentUrl);
console.log("\n   (na tela 'app não verificado': Avançado → Acessar Semeia)");
console.log("\n2. Aguardando o retorno em " + REDIRECT_URI + " ...\n");

const code = await new Promise((resolve, reject) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url, REDIRECT_URI);
    const received = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      received
        ? "<p>Autorizado. Pode fechar esta aba e voltar ao terminal.</p>"
        : `<p>Falhou: ${error || "sem código"}</p>`,
    );
    server.close();
    received ? resolve(received) : reject(new Error(error || "sem código na resposta"));
  });
  server.listen(5580);
});

// ------------------------------------------------------------------ 2. token ---

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }),
});
const token = await tokenResponse.json();
if (!tokenResponse.ok || !token.refresh_token) {
  console.error("\nNão veio refresh token:", JSON.stringify({ ...token, access_token: "<omitido>" }, null, 2));
  console.error("Se veio só access_token, revogue em https://myaccount.google.com/permissions e rode de novo.");
  process.exit(1);
}
console.log("✅ Autorizado. Refresh token recebido (não será exibido).");

// --------------------------------------------------- 3. endereço autorizado ---

const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
  headers: { authorization: `Bearer ${token.access_token}` },
});
const profile = await profileResponse.json();
const address = profile.email;
if (!address) {
  console.error("\nNão consegui ler o endereço da conta:", JSON.stringify(profile, null, 2));
  process.exit(1);
}
console.log(`✅ Remetente: ${address}`);

// ----------------------------------------------------------------- 4. worker ---

await putSecret("GMAIL_CLIENT_ID", clientId);
await putSecret("GMAIL_CLIENT_SECRET", clientSecret);
await putSecret("GMAIL_REFRESH_TOKEN", token.refresh_token);

const configPath = join(API_DIR, "wrangler.jsonc");
const config = await readFile(configPath, "utf8");
const patched = config.replace(/("EMAIL_FROM":\s*)"[^"]*"/, `$1"${address}"`);
if (patched === config) {
  console.error(`\n⚠ Não achei EMAIL_FROM no wrangler.jsonc. Preencha à mão com ${address}.`);
} else {
  await writeFile(configPath, patched);
  console.log(`\n✅ EMAIL_FROM = ${address} no wrangler.jsonc`);
}

if (skipDeploy) {
  console.log("\n--no-deploy: pare aqui e rode `npm run deploy` quando quiser.\n");
  process.exit(0);
}

console.log("\n→ deploy do Worker\n");
await run("npm", ["run", "deploy"]);
console.log("\n🌱 Pronto. Os e-mails de boas-vindas e de aprovação já estão ativos.\n");
