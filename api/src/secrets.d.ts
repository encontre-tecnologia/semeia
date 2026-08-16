interface Env {
  ADMIN_TOKEN: string;
  /** Credenciais OAuth da conta Google que envia os e-mails (ver src/gmail.ts). */
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
}
