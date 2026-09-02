// QitPit — admin panel. Routes and templates in one module.
// Every mutating route requires a valid session AND a matching CSRF token.

import { writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import {
  db, getSettings, setSettings, DEFAULT_SETTINGS, allCategories, searchProducts,
  productById, slugify, uniqueSlug, listImages, ORDER_STATUSES, UPLOAD_DIR,
} from './db.js';
import {
  SESSION_COOKIE, hashPassword, verifyPassword, passwordProblem,
  createSession, getSession, destroySession, csrfOk, rateLimit, clientKey,
} from './auth.js';
import { esc, money, ICONS, brandMark } from './views.js';
import { sendHtml, sendJson, redirect, readForm, readBody, IS_PROD } from './server.js';

const MAX_IMAGE = 5 * 1024 * 1024;

// ---------------------------------------------------------------- cookies

const parseCookies = (header) =>
  Object.fromEntries(
    String(header || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k, decodeURIComponent(v)])
  );

const setCookie = (res, name, value, maxAge) =>
  res.setHeader('Set-Cookie', [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Strict',
    IS_PROD ? 'Secure' : '',
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join('; '));

// ---------------------------------------------------------------- chrome

const NAV = [
  ['/admin', 'Dashboard', ICONS.check],
  ['/admin/products', 'Products', ICONS.bag],
  ['/admin/categories', 'Categories', ICONS.menu],
  ['/admin/orders', 'Orders', ICONS.truck],
  ['/admin/content', 'Homepage & content', ICONS.swap],
  ['/admin/settings', 'Store settings', ICONS.pin],
  ['/admin/account', 'Your account', ICONS.clock],
];

function shell({ title, body, session, path, nonce, flash }) {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | QiT PiT admin</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/logo-icon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600&display=swap">
<link rel="stylesheet" href="/styles.css">
<script nonce="${nonce}">
try { var t = localStorage.getItem('qp-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
</script>
</head>
<body class="admin">
<div class="admin-shell">
  <div class="admin-top">
    <span class="brand">${brandMark()}</span>
    <span class="admin-badge">Admin</span>
    <button class="icon-btn theme-btn" type="button" data-theme-toggle>
      <span class="sr-only">Switch theme</span>
      <span class="theme-icon theme-icon--sun">${ICONS.sun}</span>
      <span class="theme-icon theme-icon--moon">${ICONS.moon}</span>
    </button>
    <a class="btn btn--quiet btn--sm" href="/" target="_blank" rel="noopener">View store</a>
    <form method="post" action="/admin/logout">
      <input type="hidden" name="csrf" value="${esc(session.csrf)}">
      <button class="btn btn--outline btn--sm" type="submit">Sign out</button>
    </form>
  </div>

  <div class="admin-body">
    <nav class="admin-nav" aria-label="Admin sections">
      ${NAV.map(([href, label, ic]) => {
        const on = href === '/admin' ? path === '/admin' : path.startsWith(href);
        return `<a href="${href}"${on ? ' aria-current="page"' : ''}>${ic}${esc(label)}</a>`;
      }).join('')}
    </nav>
    <main class="admin-main">
      ${flash ? `<p class="flash flash--${flash.type}">${esc(flash.text)}</p>` : ''}
      ${body}
    </main>
  </div>
</div>
<div class="toast" data-toast hidden role="status" aria-live="polite"></div>
<script nonce="${nonce}" src="/admin.js" defer></script>
</body>
</html>`;
}

const loginPage = ({ nonce, error, notice }) => `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in | QiT PiT admin</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/logo-icon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600&display=swap">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="admin">
<div class="admin-login">
  <div class="admin-login__card">
    <p class="brand">${brandMark({ full: true })}</p>
    <h1 class="admin-title" style="margin-bottom:var(--s5)">Sign in</h1>
    ${error ? `<p class="flash flash--err">${esc(error)}</p>` : ''}
    ${notice ? `<p class="flash flash--ok">${esc(notice)}</p>` : ''}
    <form method="post" action="/admin/login" class="admin-form">
      <fieldset class="field-group">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="username" autofocus maxlength="120">
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required autocomplete="current-password" maxlength="200">
        </div>
      </fieldset>
      <button class="btn btn--solid btn--lg btn--block" type="submit">Sign in</button>
    </form>
    <p class="muted small" style="margin-top:var(--s5);margin-bottom:0">
      No account yet? Run <code>node create-admin.js</code> on the server.
    </p>
  </div>
</div>
</body>
</html>`;

// ---------------------------------------------------------------- pages

function dashboardPage() {
  const s = getSettings();
  const one = (sql, ...a) => db.prepare(sql).get(...a);

  const stats = [
    [one('SELECT COUNT(*) n FROM products WHERE published = 1').n, 'Published'],
    [one('SELECT COUNT(*) n FROM products WHERE stock = 0').n, 'Out of stock'],
    [one("SELECT COUNT(*) n FROM orders WHERE status = 'new'").n, 'New orders'],
    [money(one("SELECT COALESCE(SUM(total),0) v FROM orders WHERE status NOT IN ('cancelled')").v, s.currency), 'Order value'],
  ];

  const recent = db
    .prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 8')
    .all();

  const lowStock = db
    .prepare('SELECT id, name, stock FROM products WHERE published = 1 AND stock <= 3 ORDER BY stock, name LIMIT 8')
    .all();

  const placeholders = Object.entries({
    'Phone number': s.phone,
    'WhatsApp number': s.whatsapp,
    'Shop address': s.address,
    Email: s.email,
  }).filter(([, v]) => !v || v.startsWith('PLACEHOLDER') || v === '+92 300 0000000' || v === '923000000000');

  return `
<div class="admin-head"><h1 class="admin-title">Dashboard</h1></div>

${placeholders.length ? `<div class="flash flash--err">Before you go live, fill in: ${esc(placeholders.map(([k]) => k).join(', '))}. Go to Store settings.</div>` : ''}

<div class="stat-grid">
  ${stats.map(([n, l]) => `<div class="stat"><p class="stat__n">${esc(n)}</p><p class="stat__l">${esc(l)}</p></div>`).join('')}
</div>

<div class="admin-grid admin-grid--2">
  <section class="card">
    <h2>Latest orders</h2>
    ${recent.length ? `<div class="table-scroll"><table class="tbl">
      <thead><tr><th>Ref</th><th>Customer</th><th>Status</th><th class="num">Total</th></tr></thead>
      <tbody>${recent.map((o) => `<tr>
        <td><a href="/admin/orders/${o.id}">${esc(o.ref)}</a></td>
        <td>${esc(o.customer_name)}<br><span class="muted small">${esc(o.phone)}</span></td>
        <td><span class="pill ${o.status === 'new' ? 'pill--new' : o.status === 'cancelled' ? 'pill--off' : 'pill--on'}">${esc(o.status)}</span></td>
        <td class="num">${money(o.total, s.currency)}</td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="muted">No orders yet.</p>'}
  </section>

  <section class="card">
    <h2>Running low</h2>
    ${lowStock.length ? `<table class="tbl" style="min-width:0">
      <tbody>${lowStock.map((p) => `<tr>
        <td><a href="/admin/products/${p.id}">${esc(p.name)}</a></td>
        <td class="num"><span class="pill ${p.stock === 0 ? 'pill--off' : 'pill--warn'}">${p.stock} left</span></td>
      </tr>`).join('')}</tbody></table>` : '<p class="muted">Every published product has stock.</p>'}
    <a class="btn btn--quiet btn--sm" href="/admin/products/new" style="margin-top:var(--s4)">Add a product</a>
  </section>
</div>`;
}

function productsPage(url) {
  const s = getSettings();
  const q = (url.searchParams.get('q') || '').slice(0, 60);
  const category = (url.searchParams.get('category') || '').slice(0, 60);
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get('page')) || 1));
  const result = searchProducts({ q, category, page, perPage: 25, includeUnpublished: true, sort: 'name' });
  const cats = allCategories(false);

  return `
<div class="admin-head">
  <h1 class="admin-title">Products <span class="muted small">(${result.total})</span></h1>
  <a class="btn btn--solid" href="/admin/products/new">Add product</a>
</div>

<form class="card" method="get" action="/admin/products">
  <div class="admin-grid admin-grid--2">
    <div class="field">
      <label for="pq">Search by name or SKU</label>
      <input id="pq" name="q" value="${esc(q)}" placeholder="e.g. denim, QP-1004">
    </div>
    <div class="field">
      <label for="pc">Category</label>
      <select id="pc" name="category">
        <option value="">All categories</option>
        ${cats.map((c) => `<option value="${esc(c.slug)}"${category === c.slug ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
  </div>
  <button class="btn btn--quiet btn--sm" type="submit" style="margin-top:var(--s4)">Filter</button>
  ${q || category ? ' <a class="btn btn--quiet btn--sm" href="/admin/products">Clear</a>' : ''}
</form>

<div class="card">
  ${result.items.length ? `<div class="table-scroll"><table class="tbl">
    <thead><tr><th></th><th>Product</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead>
    <tbody>${result.items.map((p) => `<tr>
      <td><img class="tbl-thumb" src="${esc(p.images[0] ? `/uploads/${encodeURIComponent(p.images[0].filename)}` : `/placeholder/${encodeURIComponent(p.slug)}.svg`)}" alt="" width="44" height="55" loading="lazy"></td>
      <td><a href="/admin/products/${p.id}"><strong>${esc(p.name)}</strong></a><br><span class="muted small">${esc(p.sku)}</span></td>
      <td>${esc(p.category_name || '—')}</td>
      <td class="num">${p.onSale ? `<s class="muted">${money(p.price, s.currency)}</s><br>${money(p.sale_price, s.currency)}` : money(p.price, s.currency)}</td>
      <td class="num"><span class="pill ${p.stock === 0 ? 'pill--off' : p.stock <= 3 ? 'pill--warn' : 'pill--on'}">${p.stock}</span></td>
      <td>
        <span class="pill ${p.published ? 'pill--on' : 'pill--off'}">${p.published ? 'Live' : 'Hidden'}</span>
        ${p.featured ? '<span class="pill pill--new">Featured</span>' : ''}
        ${p.is_new ? '<span class="pill">New</span>' : ''}
      </td>
      <td><a class="btn btn--quiet btn--sm" href="/admin/products/${p.id}">Edit</a></td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="muted">No products match. <a href="/admin/products/new">Add one</a>.</p>'}

  ${result.pages > 1 ? `<nav class="pager">
    ${result.page > 1 ? `<a class="btn btn--quiet btn--sm" href="/admin/products?page=${result.page - 1}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}">Previous</a>` : '<span></span>'}
    <p class="muted small">Page ${result.page} of ${result.pages}</p>
    ${result.page < result.pages ? `<a class="btn btn--quiet btn--sm" href="/admin/products?page=${result.page + 1}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}">Next</a>` : '<span></span>'}
  </nav>` : ''}
</div>`;
}

function productForm(p, session) {
  const s = getSettings();
  const cats = allCategories(false);
  const isNew = !p;
  const v = p || {
    id: 0, name: '', sku: '', summary: '', description: '', price: '', sale_price: '',
    stock: 0, category_id: cats[0]?.id, sizes: [], colors: [], featured: 0, is_new: 1, published: 1,
  };

  return `
<div class="admin-head">
  <h1 class="admin-title">${isNew ? 'Add product' : esc(v.name)}</h1>
  <a class="btn btn--quiet btn--sm" href="/admin/products">Back to products</a>
</div>

<form class="admin-form" method="post" action="/admin/products/save">
  <input type="hidden" name="csrf" value="${esc(session.csrf)}">
  <input type="hidden" name="id" value="${v.id}">

  <section class="card">
    <h2>The basics</h2>
    <div class="field">
      <label for="name">Product name <span class="opt__req">required</span></label>
      <input id="name" name="name" required maxlength="120" value="${esc(v.name)}" placeholder="e.g. Oxford Cotton Shirt">
    </div>
    <div class="admin-grid admin-grid--2" style="margin-top:var(--s4)">
      <div class="field">
        <label for="sku">SKU / product code</label>
        <input id="sku" name="sku" maxlength="40" value="${esc(v.sku)}" placeholder="Leave blank and we will make one">
      </div>
      <div class="field">
        <label for="category_id">Category</label>
        <select id="category_id" name="category_id">
          <option value="">No category</option>
          ${cats.map((c) => `<option value="${c.id}"${v.category_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field" style="margin-top:var(--s4)">
      <label for="summary">Short line (shown under the price)</label>
      <input id="summary" name="summary" maxlength="200" value="${esc(v.summary)}">
    </div>
    <div class="field" style="margin-top:var(--s4)">
      <label for="description">Full description</label>
      <textarea id="description" name="description" rows="6" maxlength="4000">${esc(v.description)}</textarea>
      <p class="field__hint">Blank lines become new paragraphs on the product page.</p>
    </div>
  </section>

  <section class="card">
    <h2>Price and stock</h2>
    <div class="admin-grid admin-grid--2">
      <div class="field">
        <label for="price">Price (${esc(s.currency)}) <span class="opt__req">required</span></label>
        <input id="price" name="price" type="number" min="0" max="10000000" step="1" required inputmode="numeric" value="${esc(v.price)}">
      </div>
      <div class="field">
        <label for="sale_price">Sale price (${esc(s.currency)})</label>
        <input id="sale_price" name="sale_price" type="number" min="0" max="10000000" step="1" inputmode="numeric" value="${esc(v.sale_price ?? '')}">
        <p class="field__hint">Leave blank if it is not on sale. Must be lower than the price.</p>
      </div>
    </div>
    <div class="field" style="margin-top:var(--s4);max-width:220px">
      <label for="stock">Stock on hand</label>
      <input id="stock" name="stock" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${esc(v.stock)}">
      <p class="field__hint">Zero shows the product as sold out.</p>
    </div>
  </section>

  <section class="card">
    <h2>Sizes and colours</h2>
    <div class="field">
      <label for="sizes">Sizes</label>
      <input id="sizes" name="sizes" maxlength="300" value="${esc(v.sizes.join(', '))}" placeholder="S, M, L, XL  —  or  30, 32, 34">
      <p class="field__hint">Separate with commas. Leave blank for one-size items like perfume.</p>
    </div>
    <div class="field" style="margin-top:var(--s4)">
      <label for="colors">Colours</label>
      <input id="colors" name="colors" maxlength="500" value="${esc(v.colors.map((c) => `${c.name}:${c.hex}`).join(', '))}" placeholder="Navy:#2A3348, Black:#1A1A1C">
      <p class="field__hint">Format <code>Name:#hexcode</code>, separated by commas. The colour code just draws the little dot.</p>
    </div>
  </section>

  <section class="card">
    <h2>Where it appears</h2>
    <div class="check-row">
      <label class="check"><input type="checkbox" name="published" value="1"${v.published ? ' checked' : ''}> Visible on the website</label>
      <label class="check"><input type="checkbox" name="featured" value="1"${v.featured ? ' checked' : ''}> Featured on the homepage</label>
      <label class="check"><input type="checkbox" name="is_new" value="1"${v.is_new ? ' checked' : ''}> Show in New arrivals</label>
    </div>
    <p class="field__hint" style="margin-top:var(--s3)">A product goes on sale automatically once you set a sale price.</p>
  </section>

  <button class="btn btn--solid btn--lg" type="submit">${isNew ? 'Create product' : 'Save changes'}</button>
</form>

${isNew ? '<p class="muted small">Save the product first, then you can upload photographs.</p>' : `
<section class="card" data-uploader data-product="${v.id}" data-csrf="${esc(session.csrf)}">
  <h2>Photographs</h2>
  <div class="img-manager" data-image-list>
    ${listImages(v.id).map((im) => `<figure>
      <img src="/uploads/${encodeURIComponent(im.filename)}" alt="${esc(im.alt)}" width="110" height="138" loading="lazy">
      <button class="btn btn--danger btn--sm" type="button" data-delete-image="${im.id}">Delete</button>
    </figure>`).join('')}
  </div>
  <label class="dropzone" for="fileInput" data-dropzone>
    <strong>Drop photographs here, or tap to choose</strong>
    <span>JPEG, PNG or WebP · up to 5 MB each · first image is the main one</span>
    <input id="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-file-input>
  </label>
  <div class="upload-list" data-upload-list></div>
  <p class="field__hint">Portrait photographs at roughly 4:5 look best. A plain wall or a clean rail behind the garment works well.</p>
</section>

<form class="card" method="post" action="/admin/products/${v.id}/duplicate" style="display:inline-block;margin-right:var(--s3)">
  <input type="hidden" name="csrf" value="${esc(session.csrf)}">
  <button class="btn btn--outline" type="submit">Duplicate this product</button>
</form>
<form class="card" method="post" action="/admin/products/${v.id}/delete" style="display:inline-block" data-confirm="Delete “${esc(v.name)}” permanently? This cannot be undone.">
  <input type="hidden" name="csrf" value="${esc(session.csrf)}">
  <button class="btn btn--danger" type="submit">Delete product</button>
</form>`}`;
}

function categoriesPage(session) {
  const cats = allCategories(false);
  return `
<div class="admin-head"><h1 class="admin-title">Categories</h1></div>

<div class="card">
  ${cats.length ? `<div class="table-scroll"><table class="tbl">
    <thead><tr><th>Name</th><th>Products</th><th>Order</th><th>Shown</th><th></th></tr></thead>
    <tbody>${cats.map((c) => `<tr>
      <td>
        <input form="cat${c.id}" type="hidden" name="csrf" value="${esc(session.csrf)}">
        <input form="cat${c.id}" type="hidden" name="id" value="${c.id}">
        <input form="cat${c.id}" name="name" value="${esc(c.name)}" maxlength="60" required aria-label="Category name">
        <input form="cat${c.id}" name="description" value="${esc(c.description)}" maxlength="200" placeholder="Short description" aria-label="Description" style="margin-top:var(--s2)">
      </td>
      <td class="num">${c.product_count}</td>
      <td><input form="cat${c.id}" name="sort_order" type="number" value="${c.sort_order}" style="width:72px" aria-label="Sort order"></td>
      <td><label class="check"><input form="cat${c.id}" type="checkbox" name="active" value="1"${c.active ? ' checked' : ''}> Shown</label></td>
      <td class="row-actions">
        <button form="cat${c.id}" class="btn btn--quiet btn--sm" type="submit">Save</button>
        <form method="post" action="/admin/categories/${c.id}/delete" data-confirm="Delete the “${esc(c.name)}” category? Products in it are kept but become uncategorised.">
          <input type="hidden" name="csrf" value="${esc(session.csrf)}">
          <button class="btn btn--danger btn--sm" type="submit">Delete</button>
        </form>
      </td>
    </tr>`).join('')}</tbody></table></div>
  ${cats.map((c) => `<form method="post" action="/admin/categories/save" id="cat${c.id}"></form>`).join('')}` : '<p class="muted">No categories yet.</p>'}
</div>

<form class="card admin-form" method="post" action="/admin/categories/save">
  <h2>Add a category</h2>
  <input type="hidden" name="csrf" value="${esc(session.csrf)}">
  <input type="hidden" name="id" value="0">
  <div class="admin-grid admin-grid--2">
    <div class="field">
      <label for="newcat">Name</label>
      <input id="newcat" name="name" required maxlength="60" placeholder="e.g. Jackets">
    </div>
    <div class="field">
      <label for="newcatd">Short description</label>
      <input id="newcatd" name="description" maxlength="200">
    </div>
  </div>
  <input type="hidden" name="active" value="1">
  <button class="btn btn--solid" type="submit">Add category</button>
</form>`;
}

function ordersPage(url) {
  const s = getSettings();
  const status = ORDER_STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
  const q = (url.searchParams.get('q') || '').slice(0, 60);

  const where = [];
  const args = [];
  if (status) { where.push('status = ?'); args.push(status); }
  if (q) { where.push('(ref LIKE ? OR customer_name LIKE ? OR phone LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const orders = db
    .prepare(`SELECT * FROM orders ${clause} ORDER BY created_at DESC, id DESC LIMIT 100`)
    .all(...args);

  return `
<div class="admin-head"><h1 class="admin-title">Orders</h1></div>

<form class="card" method="get" action="/admin/orders">
  <div class="admin-grid admin-grid--2">
    <div class="field">
      <label for="oq">Search reference, name or phone</label>
      <input id="oq" name="q" value="${esc(q)}">
    </div>
    <div class="field">
      <label for="os">Status</label>
      <select id="os" name="status">
        <option value="">All statuses</option>
        ${ORDER_STATUSES.map((v) => `<option value="${v}"${status === v ? ' selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
  </div>
  <button class="btn btn--quiet btn--sm" type="submit" style="margin-top:var(--s4)">Filter</button>
  ${q || status ? ' <a class="btn btn--quiet btn--sm" href="/admin/orders">Clear</a>' : ''}
</form>

<div class="card">
  ${orders.length ? `<div class="table-scroll"><table class="tbl">
    <thead><tr><th>Ref</th><th>Placed</th><th>Customer</th><th>Method</th><th>Status</th><th class="num">Total</th><th></th></tr></thead>
    <tbody>${orders.map((o) => `<tr>
      <td><a href="/admin/orders/${o.id}"><strong>${esc(o.ref)}</strong></a></td>
      <td class="muted small">${esc(o.created_at)}</td>
      <td>${esc(o.customer_name)}<br><span class="muted small">${esc(o.phone)}</span></td>
      <td class="small">${esc(o.method)}</td>
      <td><span class="pill ${o.status === 'new' ? 'pill--new' : o.status === 'cancelled' ? 'pill--off' : 'pill--on'}">${esc(o.status)}</span></td>
      <td class="num">${money(o.total, s.currency)}</td>
      <td><a class="btn btn--quiet btn--sm" href="/admin/orders/${o.id}">Open</a></td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="muted">No orders match.</p>'}
</div>`;
}

function orderPage(order, session) {
  const s = getSettings();
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const waText = [
    `Assalam-o-alaikum ${order.customer_name}, this is ${s.store_name}.`,
    `Your order ${order.ref} (${money(order.total, s.currency)}) is confirmed.`,
  ].join('\n');
  const waHref = `https://wa.me/${encodeURIComponent(order.phone.replace(/\D/g, '').replace(/^0/, '92'))}?text=${encodeURIComponent(waText)}`;

  return `
<div class="admin-head">
  <h1 class="admin-title">Order ${esc(order.ref)}</h1>
  <a class="btn btn--quiet btn--sm" href="/admin/orders">Back to orders</a>
</div>

<div class="admin-grid admin-grid--2">
  <section class="card">
    <h2>Items</h2>
    <div class="table-scroll"><table class="tbl" style="min-width:0">
      <tbody>${items.map((i) => `<tr>
        <td>${esc(i.name)}<br><span class="muted small">${esc(i.sku)}${i.size ? ` · size ${esc(i.size)}` : ''}${i.color ? ` · ${esc(i.color)}` : ''}</span></td>
        <td class="num">${i.qty} × ${money(i.unit_price, s.currency)}</td>
        <td class="num"><strong>${money(i.line_total, s.currency)}</strong></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <dl class="sumline" style="margin-top:var(--s4)"><dt>Subtotal</dt><dd>${money(order.subtotal, s.currency)}</dd></dl>
    <dl class="sumline"><dt>Delivery</dt><dd>${order.delivery_fee ? money(order.delivery_fee, s.currency) : 'Free'}</dd></dl>
    <dl class="sumline sumline--total"><dt>Total</dt><dd>${money(order.total, s.currency)}</dd></dl>
  </section>

  <div>
    <section class="card">
      <h2>Customer</h2>
      <p><strong>${esc(order.customer_name)}</strong><br>
      <a href="tel:${esc(order.phone.replace(/\s/g, ''))}">${esc(order.phone)}</a></p>
      ${order.address ? `<p class="muted small">${esc(order.address)}${order.city ? `<br>${esc(order.city)}` : ''}</p>` : '<p class="muted small">No address — collection or to be confirmed.</p>'}
      ${order.notes ? `<p class="muted small"><strong>Note:</strong> ${esc(order.notes)}</p>` : ''}
      <p class="muted small">Payment method: <strong>${esc(order.method)}</strong> · Placed ${esc(order.created_at)}</p>
      <a class="btn btn--wa btn--sm" href="${esc(waHref)}" target="_blank" rel="noopener">${ICONS.whatsapp} Message on WhatsApp</a>
    </section>

    <form class="card admin-form" method="post" action="/admin/orders/${order.id}/status">
      <h2>Update status</h2>
      <input type="hidden" name="csrf" value="${esc(session.csrf)}">
      <div class="field">
        <label for="status">Status</label>
        <select id="status" name="status">
          ${ORDER_STATUSES.map((v) => `<option value="${v}"${order.status === v ? ' selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--solid" type="submit">Save status</button>
    </form>
  </div>
</div>`;
}

const textField = (id, label, value, hint = '', rows = 0) => `
<div class="field">
  <label for="${id}">${esc(label)}</label>
  ${rows
    ? `<textarea id="${id}" name="${id}" rows="${rows}" maxlength="4000">${esc(value)}</textarea>`
    : `<input id="${id}" name="${id}" maxlength="400" value="${esc(value)}">`}
  ${hint ? `<p class="field__hint">${esc(hint)}</p>` : ''}
</div>`;

function contentPage(session) {
  const s = getSettings();
  return `
<div class="admin-head"><h1 class="admin-title">Homepage &amp; content</h1></div>
<form class="admin-form" method="post" action="/admin/content">
  <input type="hidden" name="csrf" value="${esc(session.csrf)}">

  <section class="card">
    <h2>Hero — the first thing people see</h2>
    ${textField('hero_heading', 'Headline', s.hero_heading, 'Keep it short and confident. One line is best.')}
    ${textField('hero_sub', 'Supporting line', s.hero_sub, '', 2)}
    <div class="admin-grid admin-grid--2" style="margin-top:var(--s4)">
      ${textField('hero_cta_label', 'Main button text', s.hero_cta_label)}
      ${textField('hero_cta_href', 'Main button link', s.hero_cta_href, 'e.g. /shop?tag=new')}
      ${textField('hero_cta2_label', 'Second button text', s.hero_cta2_label)}
      ${textField('hero_cta2_href', 'Second button link', s.hero_cta2_href)}
    </div>
  </section>

  <section class="card">
    <h2>Promotional band</h2>
    <label class="check"><input type="checkbox" name="promo_enabled" value="1"${s.promo_enabled === '1' ? ' checked' : ''}> Show this section on the homepage</label>
    <div style="margin-top:var(--s4)">
      ${textField('promo_title', 'Small label', s.promo_title)}
      ${textField('promo_text', 'Main line', s.promo_text, '', 2)}
      <div class="admin-grid admin-grid--2">
        ${textField('promo_cta_label', 'Button text', s.promo_cta_label)}
        ${textField('promo_cta_href', 'Button link', s.promo_cta_href)}
      </div>
    </div>
  </section>

  <section class="card">
    <h2>About page</h2>
    ${textField('about_body', 'About text', s.about_body, 'Leave a blank line between paragraphs. Write plainly and do not claim anything that is not true.', 10)}
  </section>

  <button class="btn btn--solid btn--lg" type="submit">Save content</button>
</form>`;
}

function settingsPage(session) {
  const s = getSettings();
  return `
<div class="admin-head"><h1 class="admin-title">Store settings</h1></div>
<form class="admin-form" method="post" action="/admin/settings">
  <input type="hidden" name="csrf" value="${esc(session.csrf)}">

  <section class="card">
    <h2>Store identity</h2>
    <div class="admin-grid admin-grid--2">
      ${textField('store_name', 'Store name', s.store_name)}
      ${textField('tagline', 'Tagline', s.tagline)}
    </div>
  </section>

  <section class="card">
    <h2>Contact and location</h2>
    <div class="admin-grid admin-grid--2">
      ${textField('phone', 'Phone number', s.phone, 'Shown and dialable on the site.')}
      ${textField('whatsapp', 'WhatsApp number', s.whatsapp, 'Type it however you like — 0346-0150880 or +92 346 0150880. We convert it for WhatsApp links.')}
      ${textField('whatsapp_display', 'WhatsApp number as shown', s.whatsapp_display, 'How customers see it, e.g. 0346-0150880')}
      ${textField('whatsapp_channel', 'WhatsApp Channel link', s.whatsapp_channel, 'Optional. Your broadcast catalogue link.')}
      ${textField('email', 'Email address', s.email)}
      ${textField('map_query', 'Google Maps search text', s.map_query, 'What the map should centre on.')}
    </div>
    ${textField('address', 'Shop address', s.address, '', 2)}
    ${textField('hours', 'Opening hours', s.hours, 'One day per line. Line breaks are kept.', 6)}
    <div class="admin-grid admin-grid--2" style="margin-top:var(--s4)">
      ${textField('instagram', 'Instagram URL', s.instagram, 'Leave blank to hide the link.')}
      ${textField('facebook', 'Facebook URL', s.facebook, 'Leave blank to hide the link.')}
    </div>
  </section>

  <section class="card">
    <h2>Delivery and payment</h2>
    <div class="admin-grid admin-grid--2">
      ${textField('currency', 'Currency symbol', s.currency)}
      ${textField('delivery_fee', 'Delivery charge', s.delivery_fee, 'Whole rupees. 0 for always free.')}
      ${textField('free_delivery_over', 'Free delivery over', s.free_delivery_over, 'Whole rupees. 0 to switch this off.')}
    </div>
    ${textField('delivery_note', 'Delivery note shown to customers', s.delivery_note, 'Only promise what you can actually deliver.', 3)}
    ${textField('instore_payment', 'Paying in the shop', s.instore_payment, 'Shown on the Contact page.')}
    ${textField('announce_text', 'Announcement bar', s.announce_text, 'The thin strip at the very top of every page. Leave blank to hide it.')}
    <div class="check-row" style="margin-top:var(--s4)">
      <label class="check"><input type="checkbox" name="cod_enabled" value="1"${s.cod_enabled === '1' ? ' checked' : ''}> Offer cash on delivery</label>
      <label class="check"><input type="checkbox" name="bank_enabled" value="1"${s.bank_enabled === '1' ? ' checked' : ''}> Offer bank transfer</label>
    </div>
    ${textField('bank_details', 'Bank transfer details', s.bank_details, 'Shown at checkout when bank transfer is enabled.', 3)}
  </section>

  <section class="card">
    <h2>Appearance</h2>
    <div class="field" style="max-width:280px">
      <label for="default_theme">Default theme for new visitors</label>
      <select id="default_theme" name="default_theme">
        <option value="light"${s.default_theme === 'light' ? ' selected' : ''}>Light</option>
        <option value="dark"${s.default_theme === 'dark' ? ' selected' : ''}>Dark</option>
      </select>
      <p class="field__hint">Visitors can still switch, and their choice is remembered.</p>
    </div>
  </section>

  <button class="btn btn--solid btn--lg" type="submit">Save settings</button>
</form>`;
}

function accountPage(session) {
  return `
<div class="admin-head"><h1 class="admin-title">Your account</h1></div>
<section class="card">
  <p>Signed in as <strong>${esc(session.email)}</strong>.</p>
  <p class="muted small">Sessions expire after 8 hours of inactivity. Always sign out on a shared computer.</p>
</section>

<form class="card admin-form" method="post" action="/admin/account">
  <h2>Change your password</h2>
  <input type="hidden" name="csrf" value="${esc(session.csrf)}">
  <div class="field">
    <label for="current">Current password</label>
    <input id="current" name="current" type="password" required autocomplete="current-password" maxlength="200">
  </div>
  <div class="field">
    <label for="next">New password</label>
    <input id="next" name="next" type="password" required autocomplete="new-password" minlength="12" maxlength="200">
    <p class="field__hint">At least 12 characters, with upper case, lower case and a number.</p>
  </div>
  <div class="field">
    <label for="confirm">Repeat the new password</label>
    <input id="confirm" name="confirm" type="password" required autocomplete="new-password" maxlength="200">
  </div>
  <button class="btn btn--solid" type="submit">Change password</button>
</form>`;
}

// ---------------------------------------------------------------- parsing

const parseSizes = (raw) =>
  String(raw || '')
    .split(',')
    .map((v) => v.trim().slice(0, 16))
    .filter(Boolean)
    .slice(0, 24);

const parseColors = (raw) =>
  String(raw || '')
    .split(',')
    .map((chunk) => {
      const [name, hex] = chunk.split(':').map((v) => (v || '').trim());
      if (!name) return null;
      return {
        name: name.slice(0, 30),
        hex: /^#[0-9a-fA-F]{3,8}$/.test(hex || '') ? hex : '#8A8A8E',
      };
    })
    .filter(Boolean)
    .slice(0, 20);

/**
 * wa.me needs an international number with no punctuation. Shop owners type
 * the local form (0346-0150880), so convert rather than silently break the
 * link on every product page.
 */
function waNumber(v) {
  const raw = String(v || '').replace(/\D/g, '');
  if (!raw) return '';
  const d = raw.replace(/^0+/, '');
  if (d.startsWith('92')) return d.slice(0, 15);
  if (d.length === 10) return `92${d}`;
  return d.slice(0, 15);
}

const intOr = (v, fallback, min, max) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ---------------------------------------------------------------- uploads

/** Trust the bytes, never the filename or the Content-Type header. */
function sniffImage(buf) {
  if (buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

async function handleUpload(req, res, productId, session) {
  const csrfHeader = req.headers['x-csrf'];
  if (!csrfOk(session, Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader)) {
    return sendJson(res, { error: 'Invalid session token. Reload the page.' }, 403);
  }

  const product = productById(productId);
  if (!product) return sendJson(res, { error: 'Product not found.' }, 404);

  const limit = rateLimit(clientKey(req, 'upload'), { limit: 60, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return sendJson(res, { error: 'Too many uploads. Wait a few minutes.' }, 429);

  let buf;
  try {
    buf = await readBody(req, MAX_IMAGE);
  } catch {
    return sendJson(res, { error: 'That file is larger than 5 MB.' }, 413);
  }

  const ext = sniffImage(buf);
  if (!ext) return sendJson(res, { error: 'Only real JPEG, PNG or WebP images are accepted.' }, 415);

  // Filename is generated, never taken from the client.
  const filename = `${randomBytes(10).toString('hex')}${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), buf, { mode: 0o644 });

  const next = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM product_images WHERE product_id = ?')
    .get(productId).n;

  const info = db
    .prepare('INSERT INTO product_images (product_id, filename, alt, sort_order) VALUES (?,?,?,?)')
    .run(productId, filename, `${product.name} — QiT PiT Center, Chitrāl`, next);

  return sendJson(res, {
    id: Number(info.lastInsertRowid),
    url: `/uploads/${filename}`,
    alt: `${product.name} — QiT PiT Center, Chitrāl`,
  });
}

// ---------------------------------------------------------------- routing

const FLASH = {
  saved: { type: 'ok', text: 'Saved.' },
  created: { type: 'ok', text: 'Product created. You can add photographs now.' },
  deleted: { type: 'ok', text: 'Deleted.' },
  duplicated: { type: 'ok', text: 'Duplicated. This copy is hidden until you publish it.' },
  pwchanged: { type: 'ok', text: 'Your password has been changed.' },
  saleprice: { type: 'err', text: 'The sale price must be lower than the normal price. It was cleared.' },
  badpw: { type: 'err', text: 'Current password is wrong, or the new one did not meet the rules.' },
};

export async function adminRoutes(req, res, url, nonce) {
  const path = url.pathname;
  const cookies = parseCookies(req.headers.cookie);
  const session = getSession(cookies[SESSION_COOKIE]);

  const render = (title, body) =>
    sendHtml(
      res,
      shell({ title, body, session, path, nonce, flash: FLASH[url.searchParams.get('m')] }),
      200,
      nonce
    );

  // ---- login
  if (path === '/admin/login') {
    if (req.method === 'GET') {
      if (session) return redirect(res, '/admin');
      return sendHtml(res, loginPage({ nonce, error: url.searchParams.get('e') ? 'Email or password is incorrect.' : '' }), 200, nonce);
    }

    // Throttle by IP: 8 attempts per 15 minutes.
    const limit = rateLimit(clientKey(req, 'login'), { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      return sendHtml(res, loginPage({ nonce, error: 'Too many attempts. Try again in a few minutes.' }), 429, nonce);
    }

    const form = await readForm(req);
    const email = String(form.email || '').trim().toLowerCase().slice(0, 120);
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);

    // Hash regardless of whether the account exists, so timing does not
    // reveal which emails are registered.
    const ok = verifyPassword(
      String(form.password || ''),
      admin ? admin.password_hash : 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'
    );

    if (!admin || !ok) return redirect(res, '/admin/login?e=1');

    const fresh = createSession(admin.id);
    setCookie(res, SESSION_COOKIE, fresh.id, 8 * 60 * 60);
    return redirect(res, '/admin');
  }

  // ---- everything past this point requires a session
  if (!session) return redirect(res, '/admin/login');

  // ---- every POST requires a matching CSRF token
  let form = null;
  if (req.method === 'POST' && !path.startsWith('/admin/upload')) {
    form = await readForm(req);
    if (!csrfOk(session, form.csrf)) {
      return sendHtml(
        res,
        shell({
          title: 'Session expired', session, path, nonce,
          flash: { type: 'err', text: 'Your session token did not match. Reload the page and try again.' },
          body: '<p><a class="btn btn--solid" href="/admin">Back to the dashboard</a></p>',
        }),
        403,
        nonce
      );
    }
  }

  if (path === '/admin/logout' && req.method === 'POST') {
    destroySession(session.id);
    setCookie(res, SESSION_COOKIE, '', 0);
    return redirect(res, '/admin/login');
  }

  // ---- uploads (own CSRF check via header)
  const upMatch = path.match(/^\/admin\/upload\/(\d+)$/);
  if (upMatch && req.method === 'POST') {
    return handleUpload(req, res, Number(upMatch[1]), session);
  }

  const imgDel = path.match(/^\/admin\/images\/(\d+)\/delete$/);
  if (imgDel && req.method === 'POST') {
    const row = db.prepare('SELECT * FROM product_images WHERE id = ?').get(Number(imgDel[1]));
    if (row) {
      db.prepare('DELETE FROM product_images WHERE id = ?').run(row.id);
      // Filenames are generated by us, so this join is safe.
      await unlink(join(UPLOAD_DIR, row.filename)).catch(() => {});
    }
    return sendJson(res, { ok: true });
  }

  // ---- dashboard
  if (path === '/admin' || path === '/admin/') return render('Dashboard', dashboardPage());

  // ---- products
  if (path === '/admin/products') return render('Products', productsPage(url));
  if (path === '/admin/products/new') return render('Add product', productForm(null, session));

  if (path === '/admin/products/save' && req.method === 'POST') {
    const id = intOr(form.id, 0, 0, 2 ** 31);
    const name = String(form.name || '').trim().slice(0, 120);
    if (!name) return redirect(res, id ? `/admin/products/${id}` : '/admin/products/new');

    const price = intOr(form.price, 0, 0, 10000000);
    let sale = form.sale_price === '' || form.sale_price == null ? null : intOr(form.sale_price, null, 0, 10000000);
    let flash = 'saved';
    if (sale != null && sale >= price) { sale = null; flash = 'saleprice'; }
    if (sale === 0) sale = null;

    const fields = {
      name,
      category_id: form.category_id ? intOr(form.category_id, null, 1, 2 ** 31) : null,
      summary: String(form.summary || '').trim().slice(0, 200),
      description: String(form.description || '').slice(0, 4000),
      price,
      sale_price: sale,
      stock: intOr(form.stock, 0, 0, 100000),
      sizes: JSON.stringify(parseSizes(form.sizes)),
      colors: JSON.stringify(parseColors(form.colors)),
      featured: form.featured ? 1 : 0,
      is_new: form.is_new ? 1 : 0,
      published: form.published ? 1 : 0,
    };

    if (id) {
      db.prepare(`UPDATE products SET
        name=?, category_id=?, summary=?, description=?, price=?, sale_price=?, stock=?,
        sizes=?, colors=?, featured=?, is_new=?, published=?, updated_at=datetime('now')
        WHERE id=?`).run(...Object.values(fields), id);

      const sku = String(form.sku || '').trim().slice(0, 40);
      if (sku && !db.prepare('SELECT id FROM products WHERE sku = ? AND id <> ?').get(sku, id)) {
        db.prepare('UPDATE products SET sku = ? WHERE id = ?').run(sku, id);
      }
      return redirect(res, `/admin/products/${id}?m=${flash}`);
    }

    let sku = String(form.sku || '').trim().slice(0, 40) || `QP-${Date.now().toString(36).toUpperCase()}`;
    if (db.prepare('SELECT id FROM products WHERE sku = ?').get(sku)) sku = `${sku}-${randomBytes(2).toString('hex')}`;

    const info = db.prepare(`INSERT INTO products
      (sku, slug, name, category_id, summary, description, price, sale_price, stock,
       sizes, colors, featured, is_new, published)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(sku, uniqueSlug(name), ...Object.values(fields));

    return redirect(res, `/admin/products/${Number(info.lastInsertRowid)}?m=created`);
  }

  const pDel = path.match(/^\/admin\/products\/(\d+)\/delete$/);
  if (pDel && req.method === 'POST') {
    const pid = Number(pDel[1]);
    for (const im of listImages(pid)) await unlink(join(UPLOAD_DIR, im.filename)).catch(() => {});
    db.prepare('DELETE FROM products WHERE id = ?').run(pid);
    return redirect(res, '/admin/products?m=deleted');
  }

  const pDup = path.match(/^\/admin\/products\/(\d+)\/duplicate$/);
  if (pDup && req.method === 'POST') {
    const src = productById(Number(pDup[1]));
    if (!src) return redirect(res, '/admin/products');
    const name = `${src.name} (copy)`;
    const info = db.prepare(`INSERT INTO products
      (sku, slug, name, category_id, summary, description, price, sale_price, stock,
       sizes, colors, featured, is_new, published)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
      .run(
        `QP-${Date.now().toString(36).toUpperCase()}`, uniqueSlug(name), name.slice(0, 120),
        src.category_id, src.summary, src.description, src.price, src.sale_price, src.stock,
        JSON.stringify(src.sizes), JSON.stringify(src.colors), src.featured, src.is_new
      );
    return redirect(res, `/admin/products/${Number(info.lastInsertRowid)}?m=duplicated`);
  }

  const pEdit = path.match(/^\/admin\/products\/(\d+)$/);
  if (pEdit) {
    const p = productById(Number(pEdit[1]));
    if (!p) return redirect(res, '/admin/products');
    return render(p.name, productForm(p, session));
  }

  // ---- categories
  if (path === '/admin/categories') return render('Categories', categoriesPage(session));

  if (path === '/admin/categories/save' && req.method === 'POST') {
    const id = intOr(form.id, 0, 0, 2 ** 31);
    const name = String(form.name || '').trim().slice(0, 60);
    if (!name) return redirect(res, '/admin/categories');
    const description = String(form.description || '').trim().slice(0, 200);
    const sortOrder = intOr(form.sort_order, 0, -999, 999);
    const active = form.active ? 1 : 0;

    if (id) {
      db.prepare('UPDATE categories SET name=?, description=?, sort_order=?, active=? WHERE id=?')
        .run(name, description, sortOrder, active, id);
    } else {
      let slug = slugify(name);
      if (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)) {
        slug = `${slug}-${randomBytes(2).toString('hex')}`;
      }
      db.prepare('INSERT INTO categories (slug, name, description, sort_order, active) VALUES (?,?,?,?,?)')
        .run(slug, name, description, sortOrder, active);
    }
    return redirect(res, '/admin/categories?m=saved');
  }

  const cDel = path.match(/^\/admin\/categories\/(\d+)\/delete$/);
  if (cDel && req.method === 'POST') {
    // Products survive; the foreign key sets their category to NULL.
    db.prepare('DELETE FROM categories WHERE id = ?').run(Number(cDel[1]));
    return redirect(res, '/admin/categories?m=deleted');
  }

  // ---- orders
  if (path === '/admin/orders') return render('Orders', ordersPage(url));

  const oStatus = path.match(/^\/admin\/orders\/(\d+)\/status$/);
  if (oStatus && req.method === 'POST') {
    // An unrecognised status leaves the order untouched rather than resetting it.
    if (!ORDER_STATUSES.includes(form.status)) return redirect(res, `/admin/orders/${oStatus[1]}`);
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(form.status, Number(oStatus[1]));
    return redirect(res, `/admin/orders/${oStatus[1]}?m=saved`);
  }

  const oView = path.match(/^\/admin\/orders\/(\d+)$/);
  if (oView) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(oView[1]));
    if (!order) return redirect(res, '/admin/orders');
    return render(`Order ${order.ref}`, orderPage(order, session));
  }

  // ---- content and settings
  if (path === '/admin/content') {
    if (req.method === 'POST') {
      setSettings({ ...pickSettings(form), promo_enabled: form.promo_enabled ? '1' : '0' });
      return redirect(res, '/admin/content?m=saved');
    }
    return render('Homepage & content', contentPage(session));
  }

  if (path === '/admin/settings') {
    if (req.method === 'POST') {
      const patch = pickSettings(form);
      patch.cod_enabled = form.cod_enabled ? '1' : '0';
      patch.bank_enabled = form.bank_enabled ? '1' : '0';
      patch.default_theme = form.default_theme === 'dark' ? 'dark' : 'light';
      patch.whatsapp = waNumber(form.whatsapp);
      for (const k of ['delivery_fee', 'free_delivery_over']) {
        patch[k] = String(intOr(form[k], 0, 0, 1000000));
      }
      for (const k of ['instagram', 'facebook', 'whatsapp_channel']) {
        const v = String(form[k] || '').trim();
        patch[k] = /^https:\/\/[\w.-]+\//.test(v) || v === '' ? v.slice(0, 200) : '';
      }
      setSettings(patch);
      return redirect(res, '/admin/settings?m=saved');
    }
    return render('Store settings', settingsPage(session));
  }

  // ---- account
  if (path === '/admin/account') {
    if (req.method === 'POST') {
      const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(session.admin_id);
      const next = String(form.next || '');
      const problem = passwordProblem(next);
      if (!verifyPassword(String(form.current || ''), admin.password_hash) || problem || next !== form.confirm) {
        return redirect(res, '/admin/account?m=badpw');
      }
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(next), admin.id);
      // Changing a password ends every other session.
      db.prepare('DELETE FROM sessions WHERE admin_id = ? AND id <> ?').run(admin.id, session.id);
      return redirect(res, '/admin/account?m=pwchanged');
    }
    return render('Your account', accountPage(session));
  }

  return sendHtml(
    res,
    shell({
      title: 'Not found', session, path, nonce,
      body: '<div class="card"><h2>That admin page does not exist.</h2><p><a class="btn btn--solid" href="/admin">Back to the dashboard</a></p></div>',
    }),
    404,
    nonce
  );
}

/** Only keys that already exist in the settings schema are ever written. */
function pickSettings(form) {
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof form[k] === 'string') out[k] = form[k].slice(0, 4000);
  }
  return out;
}
