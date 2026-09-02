// Check the order-email configuration:  npm run test-email
//
// With --demo it delivers through a throwaway Ethereal inbox instead of your
// real SMTP settings and prints a preview URL, so you can see exactly what the
// notification looks like before any real credentials exist.
import './env.js';

const demo = process.argv.includes('--demo');
const { db, getSettings, orderByRef } = await import('./db.js');
const settings = getSettings();

if (!demo) {
  const { sendTestEmail, emailStatus } = await import('./notify.js');
  console.log(`\n  Order email: ${emailStatus()}\n`);
  try {
    const id = await sendTestEmail(settings);
    console.log(`  Sent. Message id ${id}`);
    console.log('  Check the inbox, including the spam folder the first time.\n');
    process.exit(0);
  } catch (err) {
    console.error(`  Failed: ${err.message}\n`);
    if (/BadCredentials|Invalid login|535/i.test(err.message)) {
      console.error('  Gmail needs an App Password (16 lowercase letters), not your');
      console.error('  account password. Turn on 2-Step Verification first, then:');
      console.error('  Google Account > Security > App passwords.\n');
      console.error('  To preview the email without any credentials:');
      console.error('    npm run test-email -- --demo\n');
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------- demo mode

const nodemailer = (await import('nodemailer')).default;
console.log('\n  Demo mode: creating a temporary test inbox...\n');

const account = await nodemailer.createTestAccount();

/** Use the newest real order if there is one, else a representative sample. */
function pickOrder() {
  const latest = db.prepare('SELECT ref FROM orders ORDER BY id DESC LIMIT 1').get();
  if (latest) {
    const o = orderByRef(latest.ref);
    return { ...o, delivery: o.delivery_fee };
  }
  return {
    ref: 'QP260831-DEMO',
    customer_name: 'Ayesha Khan',
    phone: '0333 5865314',
    city: 'Chitral',
    address: 'Shahi Bazar, near Dakhana Chowk',
    notes: 'Please call before delivery',
    method: 'cod',
    subtotal: 8600,
    delivery: 0,
    total: 8600,
    items: [
      { name: 'Winter Zipper Jacket', size: 'L', color: 'Navy', qty: 1, unit_price: 5900, line_total: 5900 },
      { name: 'Loose Fit Graphic T-Shirt', size: 'M', color: '', qty: 2, unit_price: 1350, line_total: 2700 },
    ],
  };
}

const order = pickOrder();

const { buildEmailForPreview } = await import('./notify.js');
const { html, text } = buildEmailForPreview(order, settings, 'https://your-site.example/admin/orders');

const transport = nodemailer.createTransport({
  host: account.smtp.host,
  port: account.smtp.port,
  secure: account.smtp.secure,
  auth: { user: account.user, pass: account.pass },
});

const info = await transport.sendMail({
  from: `"${settings.store_name} website" <${account.user}>`,
  to: account.user,
  subject: `New order ${order.ref} — ${settings.currency} ${order.total.toLocaleString('en-PK')} — ${order.customer_name}`,
  text,
  html,
});

console.log(`  Order used : ${order.ref}`);
console.log(`  Delivered  : ${info.messageId}`);
console.log(`\n  OPEN THIS TO SEE THE EMAIL:`);
console.log(`  ${nodemailer.getTestMessageUrl(info)}\n`);
process.exit(0);
