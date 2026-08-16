/**
 * Semeia — e-mails transacionais para lojistas (Cloudflare Email Sending).
 *
 * O transporte é a API do Gmail (ver gmail.ts). Fica dormente enquanto os
 * segredos GMAIL_* / a var EMAIL_FROM não estiverem configurados: nenhuma
 * tentativa de envio acontece e o cadastro/aprovação seguem funcionando.
 *
 * Nenhuma falha de e-mail derruba a requisição: erros são logados e engolidos,
 * porque um lojista não pode perder o cadastro por causa de uma caixa cheia.
 */

import { gmailConfigured, sendViaGmail } from "./gmail";

const SITE_URL = "https://semeiabr.com";
const SENDER_NAME = "Semeia";

export interface StoreEmailTarget {
  id: string;
  name: string;
  contactName: string;
  email: string;
  slug: string | null;
}

interface Message {
  subject: string;
  html: string;
  text: string;
}

function firstName(contactName: string): string {
  const first = contactName.trim().split(/\s+/)[0];
  return first || "tudo bem";
}

/** Mesmo formato que a área do vendedor usa no botão de compartilhar. */
function storeUrl(store: StoreEmailTarget): string {
  return `${SITE_URL}/loja?id=${encodeURIComponent(store.slug || store.id)}`;
}

/** Casca comum dos e-mails: sem imagem externa, sem fonte remota, só HTML inline. */
/**
 * Mesma identidade do site: papel creme, tinta marrom-escura, verde de destaque
 * e a serifada (Charter no site, Georgia como equivalente universal em e-mail —
 * cliente de e-mail não carrega fonte externa). Tudo em estilo inline e sem
 * imagem: é o que sobrevive ao Gmail, Outlook e Apple Mail.
 *
 * Mantido de propósito, por causa de entregabilidade: um único link, nenhum
 * emoji, nenhuma imagem e a versão em texto puro sempre junto.
 */
const PAPER = "#E7E6DA";
const PAPER_RAISED = "#F1EFE3";
const INK = "#2B2418";
const INK_SOFT = "#6B6353";
const ACCENT = "#5C6B33";
const LINE = "#C9C2A6";
const SERIF = "Charter,'Sitka Text',Cambria,Georgia,serif";
const MONO = "'SF Mono',Consolas,'Liberation Mono',monospace";

function layout(
  heading: string,
  blocks: string[],
  cta?: { href: string; label: string },
  // Bloco solto (tabela do pedido, aviso da reserva): entra fora dos <p>, porque
  // tabela dentro de parágrafo quebra no Outlook.
  panel = "",
  // O rodapé padrão fala com o lojista. Os avisos internos trocam essa linha,
  // senão o administrador lê que "cadastrou uma loja" — o que não aconteceu.
  footerNote = "Você recebeu este e-mail porque cadastrou uma loja no Semeia. Se não foi você, basta responder esta mensagem.",
): string {
  const paragraphs = blocks
    .map((block) => `<p style="margin:0 0 15px;font-family:${SERIF};font-size:16px;line-height:1.62;color:${INK}">${block}</p>`)
    .join("\n        ");
  const button = cta
    ? `<p style="margin:26px 0 6px">
          <a href="${cta.href}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:${ACCENT};color:${PAPER_RAISED};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none">${cta.label} &rarr;</a>
        </p>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${PAPER};">
  <!-- A margem fica no td: padding na table de 100% estoura a largura no celular. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}">
    <tr><td align="center" style="padding:28px 14px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${PAPER_RAISED};border:1px solid ${LINE};border-radius:18px">
        <tr><td style="padding:34px 34px 30px">
        <p style="margin:0 0 20px;font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${ACCENT}">Semeia</p>
        <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:27px;line-height:1.16;letter-spacing:-.02em;color:${INK}">${heading}</h1>
        ${paragraphs}
        ${panel}
        ${button}
        <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid ${LINE};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:${INK_SOFT}">
          Semeia — vitrine de produtores locais.<br>
          ${footerNote}
        </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function welcomeMessage(store: StoreEmailTarget): Message {
  const heading = "Recebemos o cadastro da sua loja.";
  const blocks = [
    `Oi, ${firstName(store.contactName)}! O cadastro da <strong>${store.name}</strong> chegou aqui e já entrou na fila de revisão.`,
    "A gente confere as informações e os selos antes de publicar — é isso que mantém o catálogo confiável para quem compra.",
    "Assim que a loja for aprovada, você recebe outro e-mail com o link dela no ar. Enquanto isso, você já pode entrar na área do vendedor e ir preparando os produtos e as fotos.",
    // Primeiro contato de um remetente novo costuma cair no spam; avisar aqui
    // evita que a loja fique esperando um e-mail que já chegou.
    "Uma dica: se o próximo e-mail não aparecer na caixa de entrada, procure no spam e marque como <strong>&ldquo;não é spam&rdquo;</strong>. Assim os avisos de pedido chegam direito depois.",
  ];
  return {
    subject: `Cadastro recebido — ${store.name} | Semeia`,
    html: layout(heading, blocks, { href: `${SITE_URL}/minha-loja`, label: "Abrir a área do vendedor" }),
    text: [
      `Oi, ${firstName(store.contactName)}!`,
      "",
      `O cadastro da ${store.name} chegou e já entrou na fila de revisão.`,
      "A gente confere as informações e os selos antes de publicar — é isso que mantém o catálogo confiável para quem compra.",
      "",
      "Assim que a loja for aprovada, você recebe outro e-mail com o link dela no ar.",
      "Se ele não aparecer na caixa de entrada, procure no spam e marque como \"não é spam\" — assim os avisos de pedido chegam direito depois.",
      `Área do vendedor: ${SITE_URL}/minha-loja`,
      "",
      "Semeia",
    ].join("\n"),
  };
}

function approvedMessage(store: StoreEmailTarget): Message {
  const url = storeUrl(store);
  const heading = `${store.name} está no ar.`;
  const blocks = [
    `Boa notícia, ${firstName(store.contactName)}: a <strong>${store.name}</strong> foi aprovada e já aparece no catálogo do Semeia.`,
    "O link da página da loja é seu — compartilhe à vontade no WhatsApp e nas redes.",
    "Cadastre os produtos com foto e descrição boas: é o que faz alguém escolher a sua loja. Pagamento, retirada e entrega você combina direto com quem compra.",
  ];
  return {
    subject: `Loja aprovada — ${store.name} | Semeia`,
    html: layout(heading, blocks, { href: url, label: "Sua loja no ar" }),
    text: [
      `Boa notícia, ${firstName(store.contactName)}!`,
      "",
      `A ${store.name} foi aprovada e já aparece no catálogo do Semeia.`,
      `Página da loja: ${url}`,
      "",
      "Cadastre os produtos com foto e descrição boas: é o que faz alguém escolher a sua loja.",
      "Pagamento, retirada e entrega você combina direto com quem compra.",
      "",
      "Semeia",
    ].join("\n"),
  };
}

function suspendedMessage(store: StoreEmailTarget): Message {
  const heading = `${store.name} saiu do catálogo por enquanto.`;
  const blocks = [
    `Oi, ${firstName(store.contactName)}. Suspendemos temporariamente a <strong>${store.name}</strong> no Semeia, e por isso ela não está aparecendo para os compradores no momento.`,
    "Isso costuma ser algo simples de resolver — uma informação que precisa ser conferida, uma dúvida sobre um produto ou um contato que não conseguimos completar.",
    "<strong>Nada foi apagado.</strong> Seus produtos, fotos e pedidos continuam guardados e voltam exatamente como estavam assim que a loja for reativada.",
    "Responda este e-mail ou chame no WhatsApp (16) 99439-2545 para a gente resolver junto.",
  ];
  return {
    subject: `Sua loja foi suspensa temporariamente — ${store.name} | Semeia`,
    html: layout(heading, blocks, { href: `${SITE_URL}/minha-loja`, label: "Abrir a área do vendedor" }),
    text: [
      `Oi, ${firstName(store.contactName)}.`,
      "",
      `Suspendemos temporariamente a ${store.name} no Semeia, e por isso ela não está aparecendo para os compradores.`,
      "Isso costuma ser algo simples de resolver — uma informação a conferir, uma dúvida sobre um produto ou um contato que não conseguimos completar.",
      "",
      "Nada foi apagado: produtos, fotos e pedidos continuam guardados e voltam como estavam quando a loja for reativada.",
      "",
      "Responda este e-mail ou chame no WhatsApp (16) 99439-2545 para a gente resolver junto.",
      `Área do vendedor: ${SITE_URL}/minha-loja`,
      "",
      "Semeia",
    ].join("\n"),
  };
}

/** Resultado do envio: os gatilhos automáticos ignoram, o painel admin mostra. */
export interface OrderEmailData {
  buyerName: string | null;
  buyerWhatsapp: string | null;
  fulfillmentLabel: string;
  items: Array<{ name: string; quantity: number; amount: number }>;
  shippingFee: number | null;
  total: number | null;
}

function money(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/** Linha da tabela do pedido: rótulo à esquerda, valor à direita. */
function orderRow(label: string, value: string, options: { strong?: boolean; top?: boolean } = {}): string {
  const border = options.top ? `border-top:1px solid ${LINE};` : "";
  const size = options.strong ? "17px" : "14px";
  const color = options.strong ? ACCENT : INK;
  // Só valor em dinheiro não pode quebrar; texto livre pode, senão come a
  // largura do nome do produto na tela do celular.
  const nowrap = /^R\$ [\d.,]+$/.test(value) ? "white-space:nowrap;" : "";
  return `<tr>
            <td style="${border}padding:${options.top ? "12px 0 0" : "7px 0"};font-family:${SERIF};font-size:15px;color:${INK_SOFT}">${label}</td>
            <td align="right" style="${border}padding:${options.top ? "12px 0 0" : "7px 0"};font-family:${MONO};font-size:${size};font-weight:700;color:${color};${nowrap}">${value}</td>
          </tr>`;
}

function orderMessage(store: StoreEmailTarget, order: OrderEmailData): Message {
  const buyer = order.buyerName || "Um comprador";
  const phone = order.buyerWhatsapp ? order.buyerWhatsapp.replace(/\D/g, "") : "";
  const itemLines = order.items.map((item) => `${item.quantity}x ${item.name} — ${money(item.amount)}`);
  const shipping = order.shippingFee === null ? "A combinar" : order.shippingFee === 0 ? "Sem frete" : money(order.shippingFee);
  const totalLine = order.total === null ? `${money(order.items.reduce((sum, item) => sum + item.amount, 0))} + frete` : money(order.total);
  const contact = phone ? `https://wa.me/${phone}` : "";
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const held = units === 1 ? "1 unidade saiu do seu estoque" : `${units} unidades saíram do seu estoque`;
  const heldRest = units === 1 ? "e fica reservada para este pedido" : "e ficam reservadas para este pedido";

  const text = [
    `Olá, ${firstName(store.contactName)}!`,
    "",
    `${buyer} informou um pedido na sua loja ${store.name}.`,
    "",
    "PEDIDO",
    ...itemLines,
    `Recebimento: ${order.fulfillmentLabel}`,
    `Frete: ${shipping}`,
    `Total: ${totalLine}`,
    "",
    order.buyerWhatsapp ? `WhatsApp do comprador: ${order.buyerWhatsapp}${contact ? ` (${contact})` : ""}` : "O comprador não informou WhatsApp.",
    "",
    `${held} ${heldRest}. Se você não confirmar o Pix em 24h, ${units === 1 ? "ela volta" : "elas voltam"} ao catálogo.`,
    "O pagamento acontece direto entre vocês — confirme o recebimento antes de separar o pedido.",
    "",
    `Seus pedidos: ${SITE_URL}/minha-loja`,
  ].join("\n");

  // Itens, frete e total em uma tabela só: é o que o vendedor precisa bater
  // com o comprovante do Pix antes de separar as coisas.
  const panel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${PAPER};border:1px solid ${LINE};border-radius:14px">
          <tr><td style="padding:16px 18px">
            <p style="margin:0 0 10px;font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${ACCENT}">Pedido</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${order.items.map((item) => orderRow(`${item.quantity}x ${item.name}`, money(item.amount))).join("\n              ")}
              ${orderRow("Recebimento", order.fulfillmentLabel)}
              ${orderRow("Frete", shipping)}
              ${orderRow("Total", totalLine, { strong: true, top: true })}
            </table>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;border:1px dashed ${LINE};border-radius:14px">
          <tr><td style="padding:14px 18px;font-family:${SERIF};font-size:14px;line-height:1.55;color:${INK_SOFT}">
            <strong style="color:${INK}">${held}</strong> ${heldRest}.
            Se você não confirmar o Pix em 24 horas, ${units === 1 ? "ela volta sozinha" : "elas voltam sozinhas"} para o catálogo.
          </td></tr>
        </table>`;

  // Depois da tabela: como falar com quem pediu e o que fazer em seguida.
  const after = [
    order.buyerWhatsapp
      ? `Fale com ${buyer} pelo WhatsApp <strong>${order.buyerWhatsapp}</strong>${contact ? ` — <a href="${contact}" style="color:${ACCENT}">abrir conversa</a>` : ""}.`
      : "O comprador não informou WhatsApp. Os dados dele estão no painel.",
    "O pagamento acontece direto entre vocês. Confirme o recebimento no painel antes de separar o pedido.",
  ].map((line) => `<p style="margin:18px 0 0;font-family:${SERIF};font-size:16px;line-height:1.62;color:${INK}">${line}</p>`).join("\n        ");

  return {
    subject: `Novo pedido na ${store.name} — ${totalLine}`,
    html: layout(
      `Novo pedido de ${buyer}.`,
      [`Olá, ${firstName(store.contactName)}! O pedido chegou agora na <strong>${store.name}</strong>.`],
      { href: `${SITE_URL}/minha-loja`, label: "Confirmar no painel" },
      panel + "\n        " + after,
    ),
    text,
  };
}

/** Enviado quando um comprador finaliza um pedido pelo site. */
export function sendStoreOrderEmail(env: Env, store: StoreEmailTarget, order: OrderEmailData): Promise<EmailResult> {
  return deliver(env, store, orderMessage(store, order), "store_order");
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

function deliver(env: Env, store: StoreEmailTarget, message: Message, kind: string): Promise<EmailResult> {
  return deliverTo(env, store.email, message, kind);
}

async function deliverTo(env: Env, to: string, message: Message, kind: string): Promise<EmailResult> {
  if (!gmailConfigured(env)) {
    console.log(JSON.stringify({ level: "info", event: "email_skipped", kind, reason: "Gmail não configurado" }));
    return { ok: false, skipped: true, error: "Envio de e-mail não está configurado." };
  }
  try {
    const id = await sendViaGmail(env, {
      to,
      fromName: SENDER_NAME,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    console.log(JSON.stringify({ level: "info", event: "email_sent", kind, id }));
    return { ok: true, id };
  } catch (error) {
    // Um e-mail que não sai não pode invalidar o cadastro nem a aprovação.
    console.error(
      JSON.stringify({
        level: "error",
        event: "email_failed",
        kind,
        code: (error as { code?: string })?.code ?? null,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Monta o e-mail sem enviar — usado para inspeção e teste. */
export function previewStoreEmail(kind: "welcome" | "approved" | "order" | "suspended", store: StoreEmailTarget, order?: OrderEmailData): Message {
  if (kind === "order") {
    return orderMessage(store, order ?? {
      buyerName: "Ana Prado",
      buyerWhatsapp: "(16) 99999-8888",
      fulfillmentLabel: "Entrega pelo vendedor",
      items: [{ name: "Cesta de verduras", quantity: 2, amount: 24 }, { name: "Mel silvestre 500g", quantity: 1, amount: 34 }],
      shippingFee: 8,
      total: 66,
    });
  }
  if (kind === "suspended") return suspendedMessage(store);
  return kind === "approved" ? approvedMessage(store) : welcomeMessage(store);
}

/** Enviado logo após o cadastro da loja, quando o status ainda é "pending". */
export function sendStoreWelcomeEmail(env: Env, store: StoreEmailTarget): Promise<EmailResult> {
  return deliver(env, store, welcomeMessage(store), "store_welcome");
}

/** Enviado quando o admin muda o status da loja para "approved". */
export function sendStoreApprovedEmail(env: Env, store: StoreEmailTarget): Promise<EmailResult> {
  return deliver(env, store, approvedMessage(store), "store_approved");
}

/** Enviado quando o admin suspende a loja: ela sai do catálogo sem aviso na tela. */
export function sendStoreSuspendedEmail(env: Env, store: StoreEmailTarget): Promise<EmailResult> {
  return deliver(env, store, suspendedMessage(store), "store_suspended");
}

/* ---------- Avisos para a administração ---------- */

/**
 * Nada avisava a administração de que havia fila. Uma loja cadastrada às 22h
 * podia esperar dias por aprovação simplesmente porque ninguém abriu o painel —
 * e no piloto, com dez lojas convidadas, essa espera é a primeira impressão que
 * elas têm do Semeia. Estes avisos existem só para encurtar esse tempo.
 */
export interface AdminAlert {
  tipo: "loja_pendente" | "destaque_loja" | "destaque_produto";
  storeName: string;
  contactName?: string;
  storeEmail?: string;
  whatsapp?: string | null;
  region?: string;
  categoryLabel?: string;
  productName?: string;
  position?: number;
  durationDays?: number;
  placementLabel?: string;
  amountCents?: number;
}

/** Destinatários do aviso: a mesma lista que autoriza o painel do admin. */
function adminRecipients(env: Env): string[] {
  return (env.ADMIN_EMAILS || "")
    .split(",")
    .map((endereco) => endereco.trim())
    .filter(Boolean);
}

function adminAlertMessage(alerta: AdminAlert): Message {
  const ehLoja = alerta.tipo === "loja_pendente";
  const heading = ehLoja
    ? "Uma loja está esperando aprovação."
    : "Um destaque está esperando liberação.";

  const linhas: Array<[string, string]> = ehLoja
    ? [
        ["Loja", alerta.storeName],
        ["Responsável", alerta.contactName || "—"],
        ["E-mail", alerta.storeEmail || "—"],
        ["WhatsApp", alerta.whatsapp || "não informado"],
        ["Categoria", alerta.categoryLabel || "—"],
        ["Região", alerta.region || "—"],
      ]
    : [
        ["Loja", alerta.storeName],
        ...(alerta.productName ? [["Produto", alerta.productName] as [string, string]] : []),
        ["Posição", alerta.position ? `${alerta.position}ª` : "—"],
        ["Período", alerta.durationDays ? `${alerta.durationDays} dias` : "—"],
        ["Onde aparece", alerta.placementLabel || "—"],
        ["Valor", alerta.amountCents === 0 ? "Gratuito (piloto)" : money((alerta.amountCents ?? 0) / 100)],
      ];

  const rotulo = ehLoja ? "Cadastro" : "Solicitação";
  const panel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${PAPER};border:1px solid ${LINE};border-radius:14px">
          <tr><td style="padding:16px 18px">
            <p style="margin:0 0 10px;font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${ACCENT}">${rotulo}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${linhas.map(([rotuloLinha, valor]) => orderRow(rotuloLinha, valor)).join("\n              ")}
            </table>
          </td></tr>
        </table>`;

  const abertura = ehLoja
    ? `A <strong>${alerta.storeName}</strong> acabou de se cadastrar e está com status pendente. Ela não aparece no catálogo até ser aprovada.`
    : `A <strong>${alerta.storeName}</strong> pediu ${alerta.productName ? "destaque para um produto" : "destaque para a loja"}. A posição fica reservada só depois da liberação.`;

  return {
    subject: ehLoja
      ? `Loja aguardando aprovação — ${alerta.storeName}`
      : `Destaque aguardando liberação — ${alerta.storeName}`,
    html: layout(
      heading,
      [abertura],
      { href: `${SITE_URL}/admin`, label: "Abrir o painel" },
      panel,
      "Você recebe este aviso porque administra o Semeia.",
    ),
    text: [
      heading,
      "",
      ...linhas.map(([rotuloLinha, valor]) => `${rotuloLinha}: ${valor}`),
      "",
      `Painel: ${SITE_URL}/admin`,
      "",
      "Semeia",
    ].join("\n"),
  };
}

/** Monta o aviso sem enviar — usado para inspeção e teste. */
export function previewAdminAlert(alerta: AdminAlert): Message {
  return adminAlertMessage(alerta);
}

/** Avisa a administração de que existe algo esperando na fila do painel. */
export function sendAdminAlertEmail(env: Env, alerta: AdminAlert): Promise<EmailResult> {
  const destinatarios = adminRecipients(env);
  if (!destinatarios.length) {
    return Promise.resolve({ ok: false, skipped: true, error: "Nenhum e-mail de administração configurado." });
  }
  // Um envio só com todos no To: o Gmail cobra uma mensagem por destinatário na
  // cota diária, e são três endereços fixos.
  return deliverTo(env, destinatarios.join(", "), adminAlertMessage(alerta), `admin_${alerta.tipo}`);
}
