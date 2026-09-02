// QiT PiT Center — HTTP server, router and public routes.
// Node built-ins throughout; the single npm dependency (nodemailer) is loaded
// lazily and only when order-email notifications are configured.

import './env.js';

import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';

import {
  getSettings, allCategories, productBySlug, productById,
  searchProducts, relatedProducts, createOrder, orderByRef, UPLOAD_DIR, DATA_DIR,
} from './db.js';
import * as V from './views.js';
import { adminRoutes } from './admin.js';
import { rateLimit, clientKey } from './auth.js';
import { notifyNewOrder, emailStatus } from './notify.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
// Everything under /public that may be requested by name.
const PUBLIC_FILES = new Set([
  '/styles.css', '/app.js', '/admin.js',
  '/logo.png', '/logo-mark.png', '/logo-icon.png',
  '/hero-wide.webp', '/hero-tall.webp', '/promo-wide.webp',
]);
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
export const IS_PROD = process.env.NODE_ENV === 'production';
export const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

/** App secret for signing order links. Generated once, kept out of git. */
function loadSecret() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) return process.env.APP_SECRET;
  const file = join(DATA_DIR, '.secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const s = randomBytes(32).toString('hex');
  writeFile(file, s, { mode: 0o600 }).catch(() => {});
  return s;
}
const SECRET = loadSecret();

export const sign = (v) => createHmac('sha256', SECRET).update(String(v)).digest('base64url');
export function signatureOk(v, token) {
  const a = Buffer.from(sign(v));
  const b = Buffer.from(String(token || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- responses

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function securityHeaders(res, nonce) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'",     // colour swatches set one custom property
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    'frame-src https://www.google.com',
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function sendHtml(res, html, status = 200, nonce = '') {
  securityHeaders(res, nonce);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

export function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

// ---------------------------------------------------------------- body parsing

const MAX_BODY = 256 * 1024; // form + JSON ceiling; uploads have their own limit

export function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        // Drain the rest instead of destroying the socket, so the handler can
        // still deliver a proper 413 to the client.
        req.resume();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readForm(req) {
  const buf = await readBody(req);
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) {
    try { return JSON.parse(buf.toString('utf8')); } catch { return {}; }
  }
  const params = new URLSearchParams(buf.toString('utf8'));
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

// ---------------------------------------------------------------- static

async function serveStatic(req, res, dir, name, { immutable = false } = {}) {
  // Only ever a single path segment; no traversal is representable.
  const safe = basename(name);
  const ext = extname(safe).toLowerCase();
  if (!MIME[ext]) return false;

  try {
    const buf = await readFile(join(dir, safe));
    const etag = `"${createHash('sha1').update(buf).digest('base64url')}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end();
      return true;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'Content-Length': buf.length,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag,
    });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- placeholders

// Deterministic SVG stand-ins so the site never shows a broken image before
// the owner uploads real photography. Replaced automatically once an image
// exists for a product.
const PALETTE = [
  ['#E7E1D7', '#C9BCA7', '#6B5B44'],
  ['#DCE1E4', '#B6C0C7', '#4C575F'],
  ['#E5DFD8', '#CFC2B2', '#5E5346'],
  ['#DEE3DC', '#BCC6BB', '#4F5A4E'],
  ['#EAE2DC', '#D2BFB0', '#6E5647'],
];

function placeholderSvg(name, tint = '') {
  const clean = String(name).replace(/\.svg$/i, '').replace(/[^a-zA-Z0-9 -]/g, ' ').trim() || 'QitPit';
  const words = clean.replace(/^(cat|hero|store)-/, '').split(/[-\s]+/).filter(Boolean);
  const label = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 28);
  const initials = (words[0]?.[0] || 'Q').toUpperCase() + (words[1]?.[0] || 'P').toUpperCase();

  let h = 0;
  for (const ch of clean) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  let [c1, c2, ink] = PALETTE[h % PALETTE.length];

  // A selected colour swatch tints the stand-in, so choosing "Black" or
  // "Caramel" visibly changes the image even before real photography exists.
  if (/^#[0-9a-fA-F]{6}$/.test(tint)) {
    const rgb = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    const mix = (pct) =>
      '#' + rgb.map((v) => Math.round(v + (255 - v) * pct).toString(16).padStart(2, '0')).join('');
    const luma = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    c1 = mix(0.55);
    c2 = mix(0.24);
    // Keep the monogram readable whichever way the swatch leans.
    ink = luma > 0.62
      ? '#' + rgb.map((v) => Math.round(v * 0.45).toString(16).padStart(2, '0')).join('')
      : mix(0.86);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" role="img" aria-label="${V.esc(label)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <pattern id="w" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="14" stroke="${ink}" stroke-opacity="0.06" stroke-width="5"/>
    </pattern>
  </defs>
  <rect width="800" height="1000" fill="url(#g)"/>
  <rect width="800" height="1000" fill="url(#w)"/>
  <circle cx="400" cy="430" r="118" fill="none" stroke="${ink}" stroke-opacity="0.28" stroke-width="1.5"/>
  <text x="400" y="430" font-family="Georgia, 'Times New Roman', serif" font-size="86" font-style="italic"
        fill="${ink}" fill-opacity="0.62" text-anchor="middle" dominant-baseline="central">${V.esc(initials)}</text>
  <text x="400" y="620" font-family="Helvetica, Arial, sans-serif" font-size="27" letter-spacing="4"
        fill="${ink}" fill-opacity="0.55" text-anchor="middle">${V.esc(label.toUpperCase())}</text>
  <text x="400" y="672" font-family="Helvetica, Arial, sans-serif" font-size="17" letter-spacing="6"
        fill="${ink}" fill-opacity="0.36" text-anchor="middle">QITPIT · CHITRAL</text>
</svg>`;
}

// Deterministic SVG stand-ins are still used for product photography that has
// not been uploaded yet (see placeholderSvg above). The brand logo itself is
// real artwork in /public — see logo.png, logo-mark.png and logo-icon.png.

// ---------------------------------------------------------------- public routes

function page(res, nonce, opts) {
  sendHtml(res, V.layout({ ...opts, nonce }), opts.status || 200, nonce);
}

function notFound(res, nonce, s, path) {
  sendHtml(
    res,
    V.layout({
      title: 'Page not found', s, nonce, path,
      body: V.errorPage({ s, code: 404, message: 'We could not find that page.' }),
    }),
    404,
    nonce
  );
}

async function handlePublic(req, res, url, nonce) {
  const s = getSettings();
  const path = url.pathname;
  const canonical = SITE_URL + path;

  // ---- home
  if (path === '/') {
    const cats = allCategories().filter((c) => c.product_count > 0).slice(0, 6);
    return page(res, nonce, {
      title: `${s.store_name} — Fashion & lifestyle store in Chitrāl`,
      description: `${s.store_name}, Shahi Bazar, Chitrāl: hoodies, jackets, denim, shirts, footwear and caps for men and women. Cash on delivery across Pakistan.`,
      s, path, canonical,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ClothingStore',
        name: s.store_name,
        description: s.tagline,
        url: SITE_URL,
        telephone: s.phone,
        address: {
          '@type': 'PostalAddress',
          streetAddress: s.address,
          addressLocality: 'Chitrāl',
          addressRegion: 'Khyber Pakhtunkhwa',
          addressCountry: 'PK',
        },
        openingHours: s.hours.split('\n'),
        currenciesAccepted: 'PKR',
        paymentAccepted: 'Cash, Cash on delivery',
      },
      body: (() => {
        // Each homepage row shows different stock. Without this the same cap
        // and slip-ons appeared in New arrivals, Featured and On sale, which
        // makes a full catalogue look thin.
        const shown = new Set();
        const pick = (tag, n = 4) => {
          const out = [];
          const take = (list) => {
            for (const item of list) {
              if (out.length === n || shown.has(item.id)) continue;
              shown.add(item.id);
              out.push(item);
            }
          };
          take(searchProducts({ tag, perPage: 12 }).items);
          // Top up a short row from the wider catalogue so the grid never
          // ends on a half-empty line.
          if (out.length < n) take(searchProducts({ perPage: 24 }).items);
          return out;
        };
        return V.homePage({
          s,
          cats,
          newest: pick('new'),
          featured: pick('featured'),
          sale: pick('sale'),
        });
      })(),
    });
  }

  // ---- shop
  if (path === '/shop') {
    const g = url.searchParams;
    const num = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    const query = {
      q: (g.get('q') || '').slice(0, 80).trim(),
      category: (g.get('category') || '').slice(0, 60),
      tag: ['new', 'featured', 'sale'].includes(g.get('tag')) ? g.get('tag') : '',
      min: num(g.get('min')),
      max: num(g.get('max')),
      sort: ['new', 'price-asc', 'price-desc', 'name'].includes(g.get('sort')) ? g.get('sort') : 'new',
      page: Math.max(1, Math.trunc(Number(g.get('page')) || 1)),
    };
    const result = searchProducts({ ...query, perPage: 12 });
    const cats = allCategories();
    const catName = cats.find((c) => c.slug === query.category)?.name;

    return page(res, nonce, {
      title: query.q ? `Search: ${query.q}` : catName ? `${catName} in Chitrāl` : 'Shop all clothing & footwear',
      description: catName
        ? `${catName} at ${s.store_name}, Shahi Bazar, Chitrāl. ${result.total} in stock, cash on delivery across Pakistan.`
        : `Browse hoodies, jackets, denim, shirts, trousers, footwear and caps at ${s.store_name}, Chitrāl.`,
      s, path, canonical,
      body: V.shopPage({ s, result, cats, query }),
    });
  }

  // ---- categories
  if (path === '/categories') {
    return page(res, nonce, {
      title: 'Shop by category',
      description: `Shop by category at ${s.store_name}, Chitrāl — hoodies, jackets, denim, shirts, t-shirts, trousers, footwear, caps and accessories.`,
      s, path, canonical,
      body: V.categoriesPage({ s, cats: allCategories() }),
    });
  }

  // ---- product detail
  if (path.startsWith('/product/')) {
    const slug = decodeURIComponent(path.slice('/product/'.length));
    const p = productBySlug(slug);
    if (!p) return notFound(res, nonce, s, path);
    const view = V.productPage({ s, p, related: relatedProducts(p) });
    return page(res, nonce, {
      title: p.name,
      description: (p.summary || p.description).slice(0, 155),
      s, path, canonical,
      og: { type: 'product', image: SITE_URL + V.imgSrc(p) },
      jsonLd: view.jsonLd,
      body: view.html,
    });
  }

  // ---- cart
  if (path === '/cart') {
    return page(res, nonce, { title: 'Your cart', s, path, body: V.cartPage({ s }) });
  }

  // ---- checkout
  if (path === '/checkout' && req.method === 'GET') {
    return page(res, nonce, {
      title: 'Place your order',
      description: 'Order with cash on delivery, WhatsApp confirmation or shop collection in Chitral.',
      s, path,
      body: V.checkoutPage({ s, csrf: sign('checkout') }),
    });
  }

  if (path === '/checkout' && req.method === 'POST') {
    const limit = rateLimit(clientKey(req, 'order'), { limit: 8, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      return sendHtml(res, V.layout({
        title: 'Too many orders', s, nonce, path,
        body: V.errorPage({ s, code: 429, message: 'Too many orders from this connection.' }),
      }), 429, nonce);
    }

    const form = await readForm(req);
    if (!signatureOk('checkout', form.csrf)) {
      return sendHtml(res, V.layout({
        title: 'Session expired', s, nonce, path,
        body: V.errorPage({ s, code: 400, message: 'Your session expired. Please try again.' }),
      }), 400, nonce);
    }

    const clean = (v, max) =>
      String(v ?? '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
    const customer = {
      name: clean(form.name, 80),
      phone: clean(form.phone, 24),
      city: clean(form.city, 60),
      address: clean(form.address, 400),
      notes: clean(form.notes, 400),
    };
    const method = ['cod', 'whatsapp', 'pickup', 'bank'].includes(form.method) ? form.method : 'cod';

    const digits = customer.phone.replace(/\D/g, '');
    if (customer.name.length < 2 || digits.length < 10 || digits.length > 13) {
      return sendHtml(res, V.layout({
        title: 'Check your details', s, nonce, path,
        body: V.errorPage({ s, code: 400, message: 'Please enter a valid name and mobile number.' }),
      }), 400, nonce);
    }

    let items = [];
    try { items = JSON.parse(form.cart || '[]'); } catch { items = []; }
    if (!Array.isArray(items) || !items.length || items.length > 50) {
      return sendHtml(res, V.layout({
        title: 'Cart problem', s, nonce, path,
        body: V.errorPage({ s, code: 400, message: 'Your cart is empty or too large.' }),
      }), 400, nonce);
    }

    try {
      const order = createOrder({ customer, items, method, settings: s });

      // Deliberately not awaited. The order is already committed; making the
      // customer wait on an SMTP handshake — or fail because a mail server is
      // down — would trade a working order for a notification. notifyNewOrder
      // swallows its own errors and logs them.
      notifyNewOrder(order, s, SITE_URL);

      return redirect(res, `/order/${order.ref}?t=${sign(order.ref)}`);
    } catch {
      return sendHtml(res, V.layout({
        title: 'Order failed', s, nonce, path,
        body: V.errorPage({ s, code: 400, message: 'None of the items in your cart are available.' }),
      }), 400, nonce);
    }
  }

  // ---- order confirmation (signed link; refs are never guessable)
  if (path.startsWith('/order/')) {
    const ref = decodeURIComponent(path.slice('/order/'.length));
    if (!signatureOk(ref, url.searchParams.get('t'))) return notFound(res, nonce, s, path);
    const order = orderByRef(ref);
    if (!order) return notFound(res, nonce, s, path);

    const lines = [
      `Assalam-o-alaikum, I have placed an order on ${s.store_name}.`,
      '',
      `Order: ${order.ref}`,
      `Name: ${order.customer_name}`,
      `Phone: ${order.phone}`,
      ...order.items.map(
        (i) => `- ${i.name}${i.size ? ` (${i.size})` : ''}${i.color ? ` [${i.color}]` : ''} x${i.qty} — ${V.money(i.line_total, s.currency)}`
      ),
      `Total: ${V.money(order.total, s.currency)}`,
      order.address ? `Address: ${order.address}, ${order.city}` : '',
    ].filter(Boolean);
    const waHref = `https://wa.me/${encodeURIComponent(s.whatsapp)}?text=${encodeURIComponent(lines.join('\n'))}`;

    return page(res, nonce, {
      title: `Order ${order.ref} received`,
      s, path,
      bodyData: ' data-clear-cart="1"',
      body: V.orderDonePage({ s, order, waHref }),
    });
  }

  // ---- about / contact
  if (path === '/about') {
    return page(res, nonce, {
      title: `About ${s.store_name}`,
      description: `${s.store_name} is a fashion and lifestyle shop in Shahi Bazar, Chitrāl, Khyber Pakhtunkhwa.`,
      s, path, canonical, body: V.aboutPage({ s }),
    });
  }

  if (path === '/contact') {
    const view = V.contactPage({ s });
    return page(res, nonce, {
      title: 'Contact & store',
      description: `Visit, call or WhatsApp ${s.store_name} in Chitral. ${s.hours}`,
      s, path, canonical, jsonLd: view.jsonLd, body: view.html,
    });
  }

  // ---- cart pricing API — the browser never decides a price
  if (path === '/api/cart' && req.method === 'POST') {
    const body = await readForm(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
    const lines = [];
    let subtotal = 0;

    for (const raw of items) {
      const p = productById(Number(raw.id));
      if (!p || !p.published || !p.inStock) continue;
      const cap = Math.min(p.stock, 20);
      const wanted = Math.max(1, Math.trunc(Number(raw.qty) || 1));
      const qty = Math.min(wanted, cap);
      const size = p.sizes.includes(raw.size) ? raw.size : '';
      const color = p.colors.some((c) => c.name === raw.color) ? raw.color : '';
      const line = p.effectivePrice * qty;
      subtotal += line;
      lines.push({
        key: [p.id, size, color].join('|'),
        id: p.id, slug: p.slug, name: p.name, image: V.imgSrc(p),
        size, color, qty, stock: cap, capped: wanted > cap,
        unit_price: p.effectivePrice, line_total: line,
      });
    }
    return sendJson(res, { lines, subtotal });
  }

  // ---- generated assets
  if (path.startsWith('/placeholder/')) {
    // ?c=RRGGBB tints the stand-in to the selected colour swatch.
    const raw = (url.searchParams.get('c') || '').replace(/^#/, '');
    const tint = /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : '';
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(placeholderSvg(basename(decodeURIComponent(path)), tint));
  }

  if (path === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': MIME['.txt'] });
    return res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /order/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  }

  if (path === '/sitemap.xml') {
    const urls = [
      ['/', '1.0', 'daily'],
      ['/shop', '0.9', 'daily'],
      ['/categories', '0.7', 'weekly'],
      ['/about', '0.4', 'monthly'],
      ['/contact', '0.6', 'monthly'],
      ...allCategories().map((c) => [`/shop?category=${c.slug}`, '0.7', 'weekly']),
      ...searchProducts({ perPage: 1000 }).items.map((p) => [`/product/${p.slug}`, '0.8', 'weekly']),
    ];
    res.writeHead(200, { 'Content-Type': MIME['.xml'] });
    return res.end(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls
          .map(([u, pr, cf]) =>
            `  <url><loc>${SITE_URL}${V.esc(u)}</loc><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`
          )
          .join('\n') +
        `\n</urlset>\n`
    );
  }

  return notFound(res, nonce, s, path);
}

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
  const nonce = randomBytes(16).toString('base64');
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  try {
    if (!['GET', 'POST', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, POST, HEAD' }).end();
      return;
    }

    const path = url.pathname;

    // Static assets
    if (PUBLIC_FILES.has(path)) {
      if (await serveStatic(req, res, PUBLIC_DIR, path.slice(1))) return;
    }
    if (path.startsWith('/uploads/')) {
      if (await serveStatic(req, res, UPLOAD_DIR, decodeURIComponent(path.slice('/uploads/'.length)), { immutable: true })) return;
      res.writeHead(404).end();
      return;
    }

    // Admin panel
    if (path === '/admin' || path.startsWith('/admin/')) {
      return await adminRoutes(req, res, url, nonce);
    }

    return await handlePublic(req, res, url, nonce);
  } catch (err) {
    const status = err.status || 500;
    // Never leak stack traces or query internals to the browser.
    if (status >= 500) console.error('[error]', req.method, req.url, err);
    const s = getSettings();
    sendHtml(
      res,
      V.layout({
        title: status === 413 ? 'Upload too large' : 'Something went wrong',
        s, nonce, path: url.pathname,
        body: V.errorPage({
          s, code: status,
          message: status === 413 ? 'That upload was too large.' : 'Something went wrong at our end.',
        }),
      }),
      status,
      nonce
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  QiT PiT Center running`);
  console.log(`  Storefront   ${SITE_URL}`);
  console.log(`  Admin panel  ${SITE_URL}/admin`);
  console.log(`  Mode         ${IS_PROD ? 'production' : 'development'}`);
  console.log(`  Order email  ${emailStatus()}\n`);
});
