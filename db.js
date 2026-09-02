// QitPit — database layer. Built-in node:sqlite, zero dependencies.
// All queries are prepared statements; no string-interpolated SQL anywhere.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(ROOT, 'uploads');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'qitpit.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf       TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  summary     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,   -- whole PKR
  sale_price  INTEGER,                      -- whole PKR, NULL = not on sale
  stock       INTEGER NOT NULL DEFAULT 0,
  sizes       TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  colors      TEXT NOT NULL DEFAULT '[]',   -- JSON array of {name,hex}
  featured    INTEGER NOT NULL DEFAULT 0,
  is_new      INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat  ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_pub  ON products(published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_feat ON products(published, featured);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, sort_order);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY,
  ref           TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  city          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  method        TEXT NOT NULL DEFAULT 'cod',   -- cod | whatsapp | pickup | bank
  subtotal      INTEGER NOT NULL DEFAULT 0,
  delivery_fee  INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new',   -- new|confirmed|packed|shipped|delivered|cancelled
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  sku        TEXT NOT NULL DEFAULT '',
  size       TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  line_total INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---------------------------------------------------------------- settings

// Placeholder values are marked PLACEHOLDER so nothing fabricated ever ships
// unnoticed. The owner replaces them in Admin > Settings.
const DEFAULT_SETTINGS = {
  store_name: 'QiT PiT Center',
  tagline: 'Head to toe, Qit Pit',
  hero_heading: 'High-street style, at Chitrāl prices.',
  hero_sub: "Men's and women's clothing, footwear and accessories — stocked in Shahi Bazar, delivered anywhere in Pakistan.",
  hero_cta_label: 'Shop the collection',
  hero_cta_href: '/shop',
  hero_cta2_label: 'New arrivals',
  hero_cta2_href: '/shop?tag=new',
  promo_enabled: '1',
  promo_title: 'Winter layering',
  promo_text: 'Premium hoodies, fleece sets, zipper jackets and long coats — in stock now.',
  promo_cta_label: 'See the edit',
  promo_cta_href: '/shop?category=jackets',
  about_body:
    'QiT PiT Center is a fashion and lifestyle shop in Shahi Bazar, Chitrāl, near Dakhana Chowk. We stock trending outfits, footwear and accessories for both men and women — premium hoodies and cotton fleece sets, winter zipper jackets, denim, long coats, cargo trousers, graphic t-shirts, caps and handmade leather footwear.\n\nWe keep high-street styles at prices below what the same pieces cost in Lahore or Rawalpindi, so nobody in District Chitrāl has to travel down-country to dress well.\n\nEverything listed here is stock we physically hold in the shop. If a size is listed, it is on the shelf. Come in and try it on, or order for delivery anywhere in Pakistan.',
  phone: '+92 333 5865314',
  whatsapp: '923460150880',
  whatsapp_display: '0346-0150880',
  whatsapp_channel: '',
  email: 'PLACEHOLDER — your@email.com',
  address: 'Shahi Bazar, near Dakhana Chowk, Chitrāl, Khyber Pakhtunkhwa, Pakistan',
  // Plus Code — Google Maps resolves this directly. The '+' must stay URL-encoded.
  map_query: 'VQ3P+3V Chitrāl, Pakistan',
  hours: 'Monday 9:45 – 20:00\nTuesday 10:05 – 20:00\nWednesday 10:10 – 20:00\nThursday – Saturday 10:00 – 20:00\nSunday 10:05 – 20:00',
  instagram: '',
  facebook: '',
  currency: 'Rs',
  delivery_fee: '250',
  free_delivery_over: '5000',
  delivery_note: 'Cash on delivery and parcel shipping all over Pakistan. Orders in Chitrāl town can be collected from the shop in Shahi Bazar.',
  instore_payment: 'In-store purchases are cash only.',
  announce_text: 'Cash on delivery and parcel shipping all over Pakistan.',
  default_theme: 'light',
  cod_enabled: '1',
  bank_enabled: '0',
  bank_details: '',
};

const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

const upsertSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
export function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (k in DEFAULT_SETTINGS) upsertSetting.run(k, String(v ?? ''));
  }
}
export { DEFAULT_SETTINGS };

// ---------------------------------------------------------------- seed

const SEED_CATEGORIES = [
  ['hoodies', 'Hoodies & Fleece', 'Premium hoodies and cotton fleece casual sets.'],
  ['jackets', 'Jackets & Coats', 'Winter zipper jackets and long coats.'],
  ['denim', 'Denim', 'Denim jackets and jeans.'],
  ['shirts', 'Shirts', 'Old-money button-downs and zipper shirts.'],
  ['tshirts', 'T-Shirts', 'Loose-fit graphic tees and everyday essentials.'],
  ['trousers', 'Trousers & Cargos', 'Baggy cargo trousers and casual bottoms.'],
  ['footwear', 'Footwear', 'Handmade Panjadar sandals, slip-ons and clutch shoes.'],
  ['caps', 'Caps & Hats', 'Vintage washed cotton caps and parachute utility hats.'],
  ['accessories', 'Accessories', 'Clutches, bags and styling pieces.'],
];

if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) {
  const ins = db.prepare(
    'INSERT INTO categories (slug, name, description, sort_order) VALUES (?, ?, ?, ?)'
  );
  SEED_CATEGORIES.forEach(([slug, name, desc], i) => ins.run(slug, name, desc, i));
}

// A small, clearly-marked demo catalogue so the site is never empty on first
// run. Every product is unpublished-safe to delete from the admin panel.
const SEED_PRODUCTS = [
  ['hoodies', 'Premium Cotton Fleece Hoodie', 3800, null, 22, ['S', 'M', 'L', 'XL'], [['Black', '#1A1A1C'], ['Beige', '#D8C9B0'], ['Olive', '#5A5C41']], 1, 1],
  ['hoodies', 'Cotton Fleece Casual Set', 5200, 4500, 14, ['M', 'L', 'XL'], [['Grey Melange', '#8A8A8E'], ['Black', '#1A1A1C']], 1, 1],
  ['jackets', 'Winter Zipper Jacket', 5900, null, 12, ['M', 'L', 'XL'], [['Black', '#1A1A1C'], ['Navy', '#2A3348']], 1, 1],
  ['jackets', 'Long Coat', 7500, 6400, 8, ['S', 'M', 'L', 'XL'], [['Camel', '#B08A5E'], ['Charcoal', '#3A3A3E']], 1, 0],
  ['denim', 'Denim Jacket', 5400, null, 10, ['M', 'L', 'XL'], [['Mid Blue', '#4A6079'], ['Black', '#1C1C1E']], 0, 1],
  ['denim', 'Straight Fit Jeans', 3900, null, 18, ['30', '32', '34', '36'], [['Indigo', '#33455E'], ['Jet Black', '#1C1C1E']], 0, 0],
  ['shirts', 'Old-Money Button-Down Shirt', 3200, null, 16, ['S', 'M', 'L', 'XL'], [['White', '#F2F0EB'], ['Sky', '#B7C7D6'], ['Sand', '#D8C9B0']], 1, 1],
  ['shirts', 'Zipper Shirt', 3450, 2900, 11, ['M', 'L', 'XL'], [['Stone', '#C4BBAC'], ['Black', '#1A1A1C']], 0, 0],
  ['tshirts', 'Loose Fit Graphic T-Shirt', 1650, 1350, 30, ['S', 'M', 'L', 'XL'], [['White', '#F2F0EB'], ['Black', '#1A1A1C'], ['Sand', '#D8C9B0']], 1, 1],
  ['tshirts', 'Everyday Premium Essential Tee', 1450, null, 26, ['S', 'M', 'L', 'XL'], [['White', '#F2F0EB'], ['Grey', '#8A8A8E']], 0, 0],
  ['trousers', 'Baggy Cargo Trousers', 3600, null, 17, ['30', '32', '34', '36'], [['Khaki', '#B7A183'], ['Black', '#1A1A1C'], ['Olive', '#5A5C41']], 1, 1],
  ['footwear', 'Handmade Panjadar Leather Sandals', 4200, null, 15, ['39', '40', '41', '42', '43', '44'], [['Tan', '#A9743F'], ['Dark Brown', '#5B3B22']], 1, 0],
  ['footwear', 'Premium Casual Slip-Ons', 4800, 3990, 12, ['39', '40', '41', '42', '43', '44'], [['Off White', '#EDE9E1'], ['Black', '#1A1A1C']], 0, 1],
  ['footwear', 'Caramel Clutch Shoes', 5200, null, 9, ['36', '37', '38', '39', '40'], [['Caramel', '#B5793B']], 1, 1],
  ['caps', 'Vintage Washed Cotton Cap', 1250, 990, 34, [], [['Washed Black', '#3A3A3E'], ['Washed Beige', '#D2C4AC'], ['Washed Blue', '#7A8DA3']], 0, 1],
  ['caps', 'Lightweight Parachute Utility Hat', 1450, null, 20, [], [['Black', '#1A1A1C'], ['Sand', '#D8C9B0']], 0, 1],
  ['accessories', "Ladies' Clutch", 2400, null, 13, [], [['Caramel', '#B5793B'], ['Black', '#1A1A1C']], 1, 0],
];

if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
  const catId = {};
  for (const c of db.prepare('SELECT id, slug FROM categories').all()) catId[c.slug] = c.id;
  const ins = db.prepare(`INSERT INTO products
    (sku, slug, name, category_id, summary, description, price, sale_price, stock,
     sizes, colors, featured, is_new, published)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  SEED_PRODUCTS.forEach(([cat, name, price, sale, stock, sizes, colors, featured, isNew], i) => {
    ins.run(
      `QP-${String(1001 + i)}`,
      slugify(name),
      name,
      catId[cat] ?? null,
      `${name} — in stock at QiT PiT Center, Shahi Bazar, Chitrāl.`,
      `${name}.\n\nStocked at QiT PiT Center, Shahi Bazar, Chitrāl. This is an example listing — replace the description, price and photographs from the admin panel before going live.`,
      price,
      sale,
      stock,
      JSON.stringify(sizes),
      JSON.stringify(colors.map(([n, hex]) => ({ name: n, hex }))),
      featured,
      isNew
    );
  });
}

// The shop's photography lives in uploads/ but is only visible once it is
// linked to a product. Attach the seeded catalogue's shots on first run so the
// storefront shows real garments rather than generated stand-ins. Products the
// owner adds later get their images through the admin panel as normal.
const SEED_PHOTOS = {
  'premium-cotton-fleece-hoodie': 'hoodie_1788326571197.webp',
  'cotton-fleece-casual-set': 'casual_set_1788326581373.webp',
  'winter-zipper-jacket': 'winter_jacket_1788326592309.webp',
  'long-coat': 'long_coat_1788326603322.webp',
  'denim-jacket': 'denim_jacket_1788326635215.webp',
  'straight-fit-jeans': 'jeans_1788326648891.webp',
  'old-money-button-down-shirt': 'button_shirt_1788326659493.webp',
  'zipper-shirt': 'zipper_shirt_1788326672207.webp',
  'loose-fit-graphic-t-shirt': 'graphic_tee_1788326711098.webp',
  'everyday-premium-essential-tee': 'essential_tee_1788326723292.webp',
  'baggy-cargo-trousers': 'cargo_trousers_1788326733363.webp',
  'handmade-panjadar-leather-sandals': 'leather_sandals_1788326747335.webp',
  'premium-casual-slip-ons': 'slip_ons_1788326798394.webp',
  'caramel-clutch-shoes': 'caramel-colored leather clutch shoes.webp',
  'ladies-clutch': "premium ladies' handbag clutch in caramel leather.webp",
  'vintage-washed-cotton-cap': 'vintage washed cotton baseball cap.webp',
  'lightweight-parachute-utility-hat': 'lightweight parachute utility bucket hat.webp',
};

{
  const findProduct = db.prepare('SELECT id, name FROM products WHERE slug = ?');
  const hasImage = db.prepare('SELECT 1 FROM product_images WHERE product_id = ?');
  const addImage = db.prepare(
    'INSERT INTO product_images (product_id, filename, alt, sort_order) VALUES (?,?,?,0)'
  );
  for (const [slug, filename] of Object.entries(SEED_PHOTOS)) {
    const row = findProduct.get(slug);
    if (!row || hasImage.get(row.id)) continue;
    if (!existsSync(join(UPLOAD_DIR, filename))) continue;
    addImage.run(row.id, filename, `${row.name} — QiT PiT Center, Chitrāl`);
  }
}

// ---------------------------------------------------------------- helpers

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/** Guarantee slug uniqueness, ignoring the row being edited. */
export function uniqueSlug(base, excludeId = 0) {
  const stmt = db.prepare('SELECT id FROM products WHERE slug = ? AND id <> ?');
  let slug = slugify(base);
  let n = 1;
  while (stmt.get(slug, excludeId)) slug = `${slugify(base)}-${++n}`;
  return slug;
}

const parseJson = (s, fallback) => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

/** Decorate a raw product row with derived display fields. */
export function hydrate(row) {
  if (!row) return null;
  const sizes = parseJson(row.sizes, []);
  const colors = parseJson(row.colors, []);
  const onSale = row.sale_price != null && row.sale_price > 0 && row.sale_price < row.price;
  const effective = onSale ? row.sale_price : row.price;
  return {
    ...row,
    sizes,
    colors,
    onSale,
    effectivePrice: effective,
    discountPct: onSale ? Math.round((1 - row.sale_price / row.price) * 100) : 0,
    inStock: row.stock > 0,
    images: listImages(row.id),
  };
}

export const listImages = (productId) =>
  db
    .prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id')
    .all(productId);

export const allCategories = (activeOnly = true) =>
  db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.published = 1) AS product_count
       FROM categories c ${activeOnly ? 'WHERE c.active = 1' : ''} ORDER BY c.sort_order, c.name`
    )
    .all();

export const categoryBySlug = (slug) =>
  db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);

export const productBySlug = (slug) =>
  hydrate(db.prepare('SELECT * FROM products WHERE slug = ? AND published = 1').get(slug));

export const productById = (id) =>
  hydrate(db.prepare('SELECT * FROM products WHERE id = ?').get(id));

/**
 * Catalogue query. Every dynamic value is bound; only the ORDER BY clause is
 * chosen from a fixed whitelist.
 */
export function searchProducts({
  q = '',
  category = '',
  tag = '',
  min = null,
  max = null,
  sort = 'new',
  page = 1,
  perPage = 12,
  includeUnpublished = false,
} = {}) {
  const where = [];
  const args = [];

  if (!includeUnpublished) where.push('p.published = 1');

  if (q) {
    where.push('(p.name LIKE ? OR p.summary LIKE ? OR p.sku LIKE ? OR c.name LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  if (category) {
    where.push('c.slug = ?');
    args.push(category);
  }
  if (tag === 'new') where.push('p.is_new = 1');
  else if (tag === 'featured') where.push('p.featured = 1');
  else if (tag === 'sale') where.push('p.sale_price IS NOT NULL AND p.sale_price > 0 AND p.sale_price < p.price');

  // Filter on the price the customer actually pays.
  const effective = 'COALESCE(NULLIF(p.sale_price, 0), p.price)';
  if (Number.isFinite(min)) { where.push(`${effective} >= ?`); args.push(min); }
  if (Number.isFinite(max)) { where.push(`${effective} <= ?`); args.push(max); }

  const ORDER = {
    new: 'p.created_at DESC, p.id DESC',
    'price-asc': `${effective} ASC`,
    'price-desc': `${effective} DESC`,
    name: 'p.name COLLATE NOCASE ASC',
  };
  const orderBy = ORDER[sort] || ORDER.new;
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.category_id ${clause}`)
    .get(...args).n;

  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), pages);

  const rows = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(...args, perPage, (current - 1) * perPage);

  return { items: rows.map(hydrate), total, pages, page: current, perPage };
}

export const relatedProducts = (product, limit = 4) =>
  db
    .prepare(
      `SELECT * FROM products
       WHERE published = 1 AND id <> ? AND (category_id = ? OR featured = 1)
       ORDER BY (category_id = ?) DESC, RANDOM() LIMIT ?`
    )
    .all(product.id, product.category_id, product.category_id, limit)
    .map(hydrate);

// ---------------------------------------------------------------- orders

export function createOrder({ customer, items, method, settings }) {
  const fee = Number(settings.delivery_fee) || 0;
  const freeOver = Number(settings.free_delivery_over) || 0;

  const priced = [];
  let subtotal = 0;

  // Re-price server-side from the database. Client-supplied prices are ignored.
  for (const raw of items) {
    const p = productById(Number(raw.id));
    if (!p || !p.published || !p.inStock) continue;
    const qty = Math.min(Math.max(1, Math.trunc(Number(raw.qty) || 1)), Math.min(p.stock, 20));
    const size = p.sizes.includes(raw.size) ? raw.size : '';
    const color = p.colors.some((c) => c.name === raw.color) ? raw.color : '';
    const line = p.effectivePrice * qty;
    subtotal += line;
    priced.push({
      product_id: p.id, name: p.name, sku: p.sku, size, color,
      unit_price: p.effectivePrice, qty, line_total: line,
    });
  }

  if (!priced.length) throw new Error('No orderable items in cart.');

  const isPickup = method === 'pickup';
  const delivery = isPickup || (freeOver > 0 && subtotal >= freeOver) ? 0 : fee;
  const ref = `QP${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(
    Math.floor(Math.random() * 9000) + 1000
  )}`;

  const tx = db.prepare(`INSERT INTO orders
    (ref, customer_name, phone, city, address, notes, method, subtotal, delivery_fee, total)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  db.exec('BEGIN');
  try {
    const res = tx.run(
      ref, customer.name, customer.phone, customer.city, customer.address,
      customer.notes, method, subtotal, delivery, subtotal + delivery
    );
    const orderId = Number(res.lastInsertRowid);
    const insItem = db.prepare(`INSERT INTO order_items
      (order_id, product_id, name, sku, size, color, unit_price, qty, line_total)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for (const it of priced) {
      insItem.run(orderId, it.product_id, it.name, it.sku, it.size, it.color, it.unit_price, it.qty, it.line_total);
    }
    db.exec('COMMIT');
    // Return the whole record, not just the totals: the confirmation page and
    // the notification email both need the customer's details.
    return {
      id: orderId,
      ref,
      customer_name: customer.name,
      phone: customer.phone,
      city: customer.city,
      address: customer.address,
      notes: customer.notes,
      method,
      items: priced,
      subtotal,
      delivery,
      total: subtotal + delivery,
    };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const orderByRef = (ref) => {
  const o = db.prepare('SELECT * FROM orders WHERE ref = ?').get(ref);
  if (!o) return null;
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  return o;
};

export const ORDER_STATUSES = ['new', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
