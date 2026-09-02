// QiT PiT Center — order notification email.
//
// Deliberately optional: if SMTP is not configured, or nodemailer is missing,
// or the mail server is down, orders still save and the site keeps working.
// The admin panel remains the source of truth for orders; email is a push on
// top of it, never the record itself.

import { esc, money } from './views.js';

const CFG = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',      // true for port 465
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  to: process.env.ORDER_EMAIL_TO || '',
  from: process.env.ORDER_EMAIL_FROM || process.env.SMTP_USER || '',
};

export const emailConfigured = () =>
  Boolean(CFG.host && CFG.user && CFG.pass && CFG.to);

/** Human-readable reason the feature is off, for the startup banner. */
export function emailStatus() {
  if (emailConfigured()) return `on — notifying ${CFG.to}`;
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ORDER_EMAIL_TO']
    .filter((k) => !process.env[k]);
  return `off — set ${missing.join(', ')} in .env to enable`;
}

let transportPromise = null;

/**
 * Built once, lazily. nodemailer is imported dynamically so that a missing
 * package disables the feature instead of crashing the server at boot.
 */
function getTransport() {
  if (!transportPromise) {
    transportPromise = import('nodemailer')
      .then(({ default: nodemailer }) =>
        nodemailer.createTransport({
          host: CFG.host,
          port: CFG.port,
          secure: CFG.secure,
          auth: { user: CFG.user, pass: CFG.pass },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 20000,
        })
      )
      .catch((err) => {
        console.error('[email] nodemailer unavailable:', err.message);
        return null;
      });
  }
  return transportPromise;
}

const row = (label, value) =>
  value
    ? `<tr><td style="padding:6px 14px 6px 0;color:#6E6B64;white-space:nowrap;vertical-align:top">${esc(label)}</td>
         <td style="padding:6px 0;color:#16161A"><strong>${esc(value)}</strong></td></tr>`
    : '';

/** Exposed for `npm run test-email -- --demo`. */
export const buildEmailForPreview = (order, s, adminUrl) => buildEmail(order, s, adminUrl);

function buildEmail(order, s, adminUrl) {
  const cur = s.currency;
  const wa = order.phone.replace(/\D/g, '').replace(/^0+/, '');
  const waLink = `https://wa.me/${wa.startsWith('92') ? wa : '92' + wa}`;

  const items = order.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #E2DED6">
          ${esc(i.name)}
          ${i.size || i.color
            ? `<br><span style="color:#6E6B64;font-size:13px">${esc([i.size, i.color].filter(Boolean).join(' · '))}</span>`
            : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #E2DED6;text-align:right;white-space:nowrap">
          ${i.qty} × ${esc(money(i.unit_price, cur))}
        </td>
        <td style="padding:8px 0 8px 14px;border-bottom:1px solid #E2DED6;text-align:right;white-space:nowrap">
          <strong>${esc(money(i.line_total, cur))}</strong>
        </td>
      </tr>`
    )
    .join('');

  const METHOD = {
    cod: 'Cash on delivery',
    whatsapp: 'Confirm on WhatsApp',
    pickup: 'Collect from the shop',
    bank: 'Bank transfer',
  };

  const html = `<!doctype html>
<html><body style="margin:0;background:#FAF9F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16161A">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8A6832">New order</p>
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:600">${esc(order.ref)}</h1>

    <div style="background:#fff;border:1px solid #E2DED6;border-radius:6px;padding:20px;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row('Customer', order.customer_name)}
        ${row('Phone', order.phone)}
        ${row('City', order.city)}
        ${row('Address', order.address)}
        ${row('Payment', METHOD[order.method] || order.method)}
        ${row('Note', order.notes)}
      </table>
      <p style="margin:18px 0 0">
        <a href="${esc(waLink)}" style="display:inline-block;padding:10px 18px;background:#1F7A4D;color:#fff;border-radius:3px;text-decoration:none;font-size:14px;font-weight:600">Message the customer on WhatsApp</a>
      </p>
    </div>

    <div style="background:#fff;border:1px solid #E2DED6;border-radius:6px;padding:20px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">${items}
        <tr><td colspan="2" style="padding:10px 0 2px;color:#6E6B64">Subtotal</td>
            <td style="padding:10px 0 2px;text-align:right">${esc(money(order.subtotal, cur))}</td></tr>
        <tr><td colspan="2" style="padding:2px 0;color:#6E6B64">Delivery</td>
            <td style="padding:2px 0;text-align:right">${order.delivery ? esc(money(order.delivery, cur)) : 'Free'}</td></tr>
        <tr><td colspan="2" style="padding:10px 0 0;font-size:16px"><strong>Total</strong></td>
            <td style="padding:10px 0 0;text-align:right;font-size:16px"><strong>${esc(money(order.total, cur))}</strong></td></tr>
      </table>
    </div>

    <p style="margin:20px 0 0;font-size:14px">
      <a href="${esc(adminUrl)}" style="color:#8A6832">Open this order in the admin panel</a>
    </p>
    <p style="margin:14px 0 0;font-size:12px;color:#85827A">
      Sent automatically by your website. The admin panel is the definitive record —
      if this email ever fails to arrive, the order is still there.
    </p>
  </div>
</body></html>`;

  const text = [
    `NEW ORDER ${order.ref}`,
    '',
    `Customer: ${order.customer_name}`,
    `Phone:    ${order.phone}`,
    order.city ? `City:     ${order.city}` : null,
    order.address ? `Address:  ${order.address}` : null,
    `Payment:  ${METHOD[order.method] || order.method}`,
    order.notes ? `Note:     ${order.notes}` : null,
    '',
    ...order.items.map(
      (i) =>
        `- ${i.name}${[i.size, i.color].filter(Boolean).length ? ` (${[i.size, i.color].filter(Boolean).join(', ')})` : ''}` +
        ` x${i.qty} — ${money(i.line_total, cur)}`
    ),
    '',
    `Subtotal: ${money(order.subtotal, cur)}`,
    `Delivery: ${order.delivery ? money(order.delivery, cur) : 'Free'}`,
    `Total:    ${money(order.total, cur)}`,
    '',
    `Admin: ${adminUrl}`,
  ]
    // keep intentional blank separators; drop only omitted fields
    .filter((line) => line !== null)
    .join('\n');

  return { html, text };
}

/**
 * Send the owner a new-order notification.
 *
 * Never throws and never blocks the checkout response — the caller fires this
 * without awaiting it. A failed email must not cost a saved order.
 */
export async function notifyNewOrder(order, settings, siteUrl) {
  if (!emailConfigured()) return { sent: false, reason: 'not configured' };

  try {
    const transport = await getTransport();
    if (!transport) return { sent: false, reason: 'nodemailer unavailable' };

    const { html, text } = buildEmail(order, settings, `${siteUrl}/admin/orders`);

    const info = await transport.sendMail({
      from: `"${settings.store_name} website" <${CFG.from}>`,
      to: CFG.to,
      replyTo: CFG.from,
      subject: `New order ${order.ref} — ${settings.currency} ${order.total.toLocaleString('en-PK')} — ${order.customer_name}`,
      text,
      html,
    });

    console.log(`[email] order ${order.ref} notified (${info.messageId})`);
    return { sent: true };
  } catch (err) {
    // Log loudly, but never surface this to the customer: their order is saved.
    console.error(`[email] FAILED for order ${order.ref}: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

/** Used by `npm run test-email` to check the configuration before going live. */
export async function sendTestEmail(settings) {
  if (!emailConfigured()) throw new Error(emailStatus());
  const transport = await getTransport();
  if (!transport) throw new Error('nodemailer is not installed — run: npm install');
  await transport.verify();
  const info = await transport.sendMail({
    from: `"${settings.store_name} website" <${CFG.from}>`,
    to: CFG.to,
    subject: `Test — ${settings.store_name} order notifications are working`,
    text:
      'This is a test from your website.\n\n' +
      'If you are reading this, new orders will arrive at this address automatically.',
  });
  return info.messageId;
}
