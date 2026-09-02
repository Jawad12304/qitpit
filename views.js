// QitPit — public site templates. Server-rendered HTML, no client framework.

import { allCategories } from './db.js';

// ---------------------------------------------------------------- helpers

/** Escape for HTML text and double-quoted attributes. Used on every value. */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape for embedding data inside a <script> block. */
export const jsonScript = (v) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/-->/g, '--\\>');

/** Render a multi-line setting (opening hours) as escaped HTML. */
export const lines = (v) => esc(v).replace(/\n/g, '<br>');

export const money = (n, cur = 'Rs') =>
  `${cur} ${Number(n || 0).toLocaleString('en-PK')}`;

export const imgSrc = (p, i = 0) =>
  p.images && p.images[i]
    ? `/uploads/${encodeURIComponent(p.images[i].filename)}`
    : `/placeholder/${encodeURIComponent(p.slug)}.svg`;

export const imgAlt = (p, i = 0) =>
  (p.images && p.images[i] && p.images[i].alt) || `${p.name} — QiT PiT Center, Chitrāl`;

/**
 * The QiT PiT wordmark. Inline (not an <img>) so it inherits the theme colours
 * and stays crisp at any size. This is the ONLY place the mark is defined —
 * swapping in an official logo means editing this function alone.
 */
export const brandMark = ({ full = false, tagline = '' } = {}) =>
  full
    ? `<img class="brand-lockup" src="/logo.png" alt="QiT PiT Center — Head to toe, Qit Pit" width="410" height="560">`
    : `<img class="brand-emblem" src="/logo-mark.png" alt="" width="204" height="240" decoding="async">
  <span class="brand-text">
    <span class="brand-row"><span class="brand-mark">QiT</span><span class="brand-mark brand-mark--alt">PiT</span><span class="brand-sub">Center</span></span>${
      tagline ? `<span class="brand-tag">${esc(tagline)}</span>` : ''
    }
  </span>`;

const icon = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICONS = {
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  bag: icon('<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  menu: icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: icon('<path d="m6 6 12 12M18 6 6 18"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: icon('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
  whatsapp: icon('<path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.1-4A8 8 0 1 1 20 12Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>'),
  phone: icon('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1.1 1A16 16 0 0 1 4 5.1 1 1 0 0 1 5 4Z"/>'),
  pin: icon('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
  truck: icon('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>'),
  clock: icon('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  check: icon('<path d="m5 13 4 4L19 7"/>'),
  chevron: icon('<path d="m9 6 6 6-6 6"/>'),
  swap: icon('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
};

// ---------------------------------------------------------------- layout

const navLinks = [
  ['/', 'Home'],
  ['/shop', 'Shop'],
  ['/categories', 'Categories'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
];

export function layout({ title, description, body, s, nonce, path = '/', og = {}, jsonLd = null, canonical, bodyData = '' }) {
  const cats = allCategories();
  const full = `${title} | ${s.store_name}`;
  const desc = description || s.tagline;
  const waHref = `https://wa.me/${encodeURIComponent(s.whatsapp)}`;

  return `<!doctype html>
<html lang="en" data-theme="${esc(s.default_theme === 'dark' ? 'dark' : 'light')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:site_name" content="${esc(s.store_name)}">
<meta property="og:title" content="${esc(og.title || full)}">
<meta property="og:description" content="${esc(og.description || desc)}">
<meta property="og:type" content="${esc(og.type || 'website')}">
${og.image ? `<meta property="og:image" content="${esc(og.image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#FAFAF9" media="(prefers-color-scheme: light)">
<link rel="icon" href="/logo-icon.png" type="image/png">
<link rel="apple-touch-icon" href="/logo-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap">
<link rel="stylesheet" href="/styles.css">
<script nonce="${nonce}">
// Apply the stored theme before first paint so the page never flashes.
try {
  var t = localStorage.getItem('qp-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
</script>
${jsonLd ? `<script type="application/ld+json" nonce="${nonce}">${jsonScript(jsonLd)}</script>` : ''}
</head>
<body data-wa="${esc(s.whatsapp)}" data-currency="${esc(s.currency)}" data-fee="${esc(s.delivery_fee)}" data-free="${esc(s.free_delivery_over)}"${bodyData}>
<a class="skip-link" href="#main">Skip to content</a>

${s.announce_text ? `<div class="announce">
  <p>${esc(s.announce_text)}</p>
</div>` : ''}

<header class="site-header" id="siteHeader">
  <div class="wrap header-inner">
    <button class="icon-btn nav-toggle" type="button" aria-expanded="false" aria-controls="mobileNav" data-nav-toggle>
      <span class="sr-only">Open menu</span>${ICONS.menu}
    </button>

    <a class="brand" href="/" aria-label="${esc(s.store_name)} — home">
      ${brandMark({ tagline: s.tagline })}
    </a>

    <nav class="primary-nav" aria-label="Primary">
      <ul>
        ${navLinks
          .map(
            ([href, label]) =>
              `<li><a href="${href}"${path === href ? ' aria-current="page"' : ''}>${label}</a></li>`
          )
          .join('')}
      </ul>
    </nav>

    <div class="header-actions">
      <button class="icon-btn" type="button" data-search-toggle aria-expanded="false" aria-controls="searchPanel">
        <span class="sr-only">Search</span>${ICONS.search}
      </button>
      <button class="icon-btn theme-btn" type="button" data-theme-toggle>
        <span class="sr-only">Switch colour theme</span>
        <span class="theme-icon theme-icon--sun">${ICONS.sun}</span>
        <span class="theme-icon theme-icon--moon">${ICONS.moon}</span>
      </button>
      <a class="icon-btn cart-btn" href="/cart">
        <span class="sr-only">Cart</span>${ICONS.bag}
        <span class="cart-count" data-cart-count hidden>0</span>
      </a>
    </div>
  </div>

  <div class="search-panel" id="searchPanel" hidden>
    <form class="wrap search-form" action="/shop" method="get" role="search">
      <label class="sr-only" for="siteSearch">Search products</label>
      <input id="siteSearch" name="q" type="search" placeholder="Search hoodies, jackets, shoes…" autocomplete="off" enterkeyhint="search">
      <button class="btn btn--solid" type="submit">Search</button>
    </form>
  </div>
</header>

<div class="mobile-nav" id="mobileNav" hidden>
  <nav aria-label="Mobile">
    <ul class="mobile-nav__main">
      ${navLinks.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('')}
    </ul>
    <p class="mobile-nav__label">Shop by category</p>
    <ul class="mobile-nav__cats">
      ${cats.map((c) => `<li><a href="/shop?category=${esc(c.slug)}">${esc(c.name)}</a></li>`).join('')}
    </ul>
    <a class="btn btn--wa" href="${esc(waHref)}" target="_blank" rel="noopener">${ICONS.whatsapp} Order on WhatsApp</a>
  </nav>
</div>

<main id="main">${body}</main>

<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <p class="brand brand--footer">${brandMark({ full: true })}</p>
      <p class="muted small">${esc(s.address)}</p>
    </div>
    <div>
      <h2 class="footer-h">Shop</h2>
      <ul class="footer-list">
        ${cats.slice(0, 6).map((c) => `<li><a href="/shop?category=${esc(c.slug)}">${esc(c.name)}</a></li>`).join('')}
        <li><a href="/shop?tag=sale">Sale</a></li>
      </ul>
    </div>
    <div>
      <h2 class="footer-h">Help</h2>
      <ul class="footer-list">
        <li><a href="/about">About us</a></li>
        <li><a href="/contact">Contact &amp; store</a></li>
        <li><a href="/cart">Your cart</a></li>
      </ul>
    </div>
    <div>
      <h2 class="footer-h">Reach us</h2>
      <ul class="footer-list">
        <li><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a></li>
        <li><a href="${esc(waHref)}" target="_blank" rel="noopener">WhatsApp ${esc(s.whatsapp_display)}</a></li>
        ${s.instagram ? `<li><a href="${esc(s.instagram)}" target="_blank" rel="noopener">Instagram</a></li>` : ''}
        ${s.facebook ? `<li><a href="${esc(s.facebook)}" target="_blank" rel="noopener">Facebook</a></li>` : ''}
      </ul>
      <p class="muted small">${lines(s.hours)}</p>
    </div>
  </div>
  <div class="wrap footer-base">
    <p class="muted small">&copy; ${new Date().getFullYear()} ${esc(s.store_name)}, Shahi Bazar, Chitrāl, Khyber Pakhtunkhwa.</p>
    <p class="muted small">Prices in Pakistani Rupees.</p>
  </div>
</footer>

<a class="wa-float" href="${esc(waHref)}" target="_blank" rel="noopener">
  ${ICONS.whatsapp}<span>WhatsApp</span>
</a>

<div class="toast" data-toast hidden role="status" aria-live="polite"></div>
<script nonce="${nonce}" src="/app.js" defer></script>
</body>
</html>`;
}

// ---------------------------------------------------------------- components

export function productCard(p, s) {
  const cur = s.currency;
  const badges = [];
  if (p.onSale) badges.push(`<span class="badge badge--sale">−${p.discountPct}%</span>`);
  else if (p.is_new) badges.push('<span class="badge">New</span>');
  if (!p.inStock) badges.push('<span class="badge badge--out">Sold out</span>');

  const hover = p.images && p.images[1]
    ? `<img class="pcard__img pcard__img--alt" src="${esc(imgSrc(p, 1))}" alt="" loading="lazy" decoding="async" width="1200" height="1200">`
    : '';

  return `<article class="pcard${p.inStock ? '' : ' pcard--out'}">
  <a class="pcard__link" href="/product/${esc(p.slug)}">
    <div class="pcard__media">
      <img class="pcard__img" src="${esc(imgSrc(p))}" alt="${esc(imgAlt(p))}" loading="lazy" decoding="async" width="1200" height="1200">
      ${hover}
      ${badges.length ? `<div class="pcard__badges">${badges.join('')}</div>` : ''}
    </div>
    <h3 class="pcard__name">${esc(p.name)}</h3>
  </a>
  <p class="pcard__meta">${esc(p.category_name || '')}</p>
  <p class="pcard__price">
    ${p.onSale
      ? `<span class="price-now">${money(p.sale_price, cur)}</span> <s class="price-was">${money(p.price, cur)}</s>`
      : `<span class="price-now">${money(p.price, cur)}</span>`}
  </p>
  ${p.inStock
    ? `<button class="btn btn--quiet pcard__add" type="button" data-quick-add="${p.id}" data-slug="${esc(p.slug)}"${p.sizes.length ? ' data-needs-options' : ''}>${p.sizes.length ? 'Choose options' : 'Add to cart'}</button>`
    : `<span class="pcard__add pcard__add--disabled" aria-disabled="true">Sold out</span>`}
</article>`;
}

const grid = (items, s, empty) =>
  items.length
    ? `<div class="pgrid">${items.map((p) => productCard(p, s)).join('')}</div>`
    : `<div class="empty">${empty}</div>`;

const section = (title, link, inner, kicker = '') => `
<section class="section">
  <div class="wrap">
    <div class="section__head">
      <div>
        ${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}
        <h2 class="section__title">${esc(title)}</h2>
      </div>
      ${link ? `<a class="link-arrow" href="${link[0]}">${esc(link[1])} ${ICONS.chevron}</a>` : ''}
    </div>
    ${inner}
  </div>
</section>`;

// ---------------------------------------------------------------- pages

export function homePage({ s, featured, newest, cats, sale }) {
  const trust = [
    [ICONS.truck, 'Delivery across Pakistan', 'Cash on delivery or parcel shipping, anywhere in the country.'],
    [ICONS.check, 'Below down-country prices', 'The same high-street styles, cheaper than Lahore or Rawalpindi.'],
    [ICONS.pin, 'A real shop in Shahi Bazar', 'Come in near Dakhana Chowk, try it on, walk out with it.'],
    [ICONS.whatsapp, 'Order on WhatsApp', `Message ${s.whatsapp_display} for sizing, stock or a custom order.`],
  ];

  return `
<section class="hero">
  <picture class="hero__shot">
    <source media="(min-width: 700px)" srcset="/hero-wide.webp" width="2400" height="1017">
    <img src="/hero-tall.webp" alt="Winter jackets, hoodies and denim from ${esc(s.store_name)}, Shahi Bazar, Chitrāl"
         width="900" height="1200" fetchpriority="high" decoding="async">
  </picture>

  <div class="wrap hero__inner">
    <div class="hero__copy">
      <p class="kicker hero__kicker">${esc(s.tagline)}</p>
      <h1 class="hero__title">${esc(s.hero_heading)}</h1>
      <p class="hero__sub">${esc(s.hero_sub)}</p>
      <div class="hero__actions">
        <a class="btn btn--hero btn--lg" href="${esc(s.hero_cta_href)}">${esc(s.hero_cta_label)}</a>
        <a class="btn btn--hero-ghost btn--lg" href="${esc(s.hero_cta2_href)}">${esc(s.hero_cta2_label)}</a>
      </div>
    </div>
  </div>
</section>

<section class="trust">
  <div class="wrap trust__grid">
    ${trust.map(([ic, h, t]) => `<div class="trust__item">${ic}<div><p class="trust__h">${esc(h)}</p><p class="muted small">${esc(t)}</p></div></div>`).join('')}
  </div>
</section>

${section('Shop by category', ['/categories', 'All categories'], `
  <div class="cat-grid">
    ${cats
      .map(
        (c) => `<a class="cat-tile" href="/shop?category=${esc(c.slug)}">
      <img src="/uploads/${encodeURIComponent(c.name)}.webp" alt="" loading="lazy" decoding="async" width="1200" height="750">
      <span class="cat-tile__body"><span class="cat-tile__name">${esc(c.name)}</span><span class="cat-tile__n">${c.product_count} item${c.product_count === 1 ? '' : 's'}</span></span>
    </a>`
      )
      .join('')}
  </div>`, 'Categories')}

${section('New arrivals', ['/shop?tag=new', 'See all new'], grid(newest, s, '<p>New stock is on its way. Check back soon.</p>'), 'Just in')}

${s.promo_enabled === '1' ? `
<section class="promo">
  <img class="promo__shot" src="/promo-wide.webp" alt="" loading="lazy" decoding="async" width="2000" height="750">
  <div class="wrap promo__inner">
    <div>
      <p class="kicker kicker--invert">${esc(s.promo_title)}</p>
      <h2 class="promo__title">${esc(s.promo_text)}</h2>
    </div>
    <a class="btn btn--invert btn--lg" href="${esc(s.promo_cta_href)}">${esc(s.promo_cta_label)}</a>
  </div>
</section>` : ''}

${section('Featured', ['/shop?tag=featured', 'See all featured'], grid(featured, s, '<p>Nothing featured yet.</p>'), 'Picked by us')}

${sale.length ? section('On sale', ['/shop?tag=sale', 'All offers'], grid(sale, s, ''), 'Reduced') : ''}

<section class="split">
  <div class="wrap split__inner">
    <div class="split__media">
      <img src="/uploads/welcoming%20photograph%20of%20a%20modern%2C%20boutique%20clothing%20storefront%20named%20QiT%20PiT%20Center.webp" alt="QitPit storefront in Chitral" loading="lazy" decoding="async" width="800" height="600">
    </div>
    <div class="split__copy">
      <p class="kicker">Visit us</p>
      <h2 class="section__title">Find us in Shahi Bazar, near Dakhana Chowk.</h2>
      <p>${esc(s.address)}</p>
      <ul class="icon-list">
        <li>${ICONS.clock}<span>${lines(s.hours)}</span></li>
        <li>${ICONS.phone}<span><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a></span></li>
        <li>${ICONS.pin}<span><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(s.map_query)}" target="_blank" rel="noopener">Open in Google Maps</a></span></li>
      </ul>
      <a class="btn btn--outline" href="/contact">Contact &amp; directions</a>
    </div>
  </div>
</section>`;
}

export function shopPage({ s, result, cats, query }) {
  const qs = (patch) => {
    const u = new URLSearchParams();
    const merged = { ...query, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== '' && v != null) u.set(k, v);
    u.delete('page');
    return `/shop?${u.toString()}`;
  };
  const pageHref = (n) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== '' && v != null) u.set(k, v);
    u.set('page', n);
    return `/shop?${u.toString()}`;
  };

  const tagLabel = { new: 'New arrivals', featured: 'Featured', sale: 'On sale' }[query.tag];
  const catLabel = cats.find((c) => c.slug === query.category)?.name;
  const heading = query.q ? `Search: “${query.q}”` : catLabel || tagLabel || 'All products';

  const filters = `
<form class="filters" method="get" action="/shop" data-filters>
  ${query.q ? `<input type="hidden" name="q" value="${esc(query.q)}">` : ''}
  <fieldset class="filters__group">
    <legend>Category</legend>
    <ul class="filters__list">
      <li><a href="${qs({ category: '' })}" class="chip${!query.category ? ' chip--on' : ''}">All</a></li>
      ${cats.map((c) => `<li><a href="${qs({ category: c.slug })}" class="chip${query.category === c.slug ? ' chip--on' : ''}">${esc(c.name)}</a></li>`).join('')}
    </ul>
  </fieldset>
  <fieldset class="filters__group">
    <legend>Show</legend>
    <ul class="filters__list">
      ${[['', 'Everything'], ['new', 'New'], ['featured', 'Featured'], ['sale', 'On sale']]
        .map(([v, l]) => `<li><a href="${qs({ tag: v })}" class="chip${(query.tag || '') === v ? ' chip--on' : ''}">${l}</a></li>`)
        .join('')}
    </ul>
  </fieldset>
  <fieldset class="filters__group">
    <legend>Price (${esc(s.currency)})</legend>
    <div class="filters__price">
      <label class="sr-only" for="fmin">Minimum price</label>
      <input id="fmin" name="min" type="number" inputmode="numeric" min="0" step="100" placeholder="Min" value="${esc(query.min ?? '')}">
      <span aria-hidden="true">–</span>
      <label class="sr-only" for="fmax">Maximum price</label>
      <input id="fmax" name="max" type="number" inputmode="numeric" min="0" step="100" placeholder="Max" value="${esc(query.max ?? '')}">
    </div>
    ${query.category ? `<input type="hidden" name="category" value="${esc(query.category)}">` : ''}
    ${query.tag ? `<input type="hidden" name="tag" value="${esc(query.tag)}">` : ''}
    ${query.sort ? `<input type="hidden" name="sort" value="${esc(query.sort)}">` : ''}
    <button class="btn btn--quiet btn--sm" type="submit">Apply price</button>
  </fieldset>
  <p class="filters__reset"><a href="/shop">Clear all filters</a></p>
</form>`;

  const pager =
    result.pages > 1
      ? `<nav class="pager" aria-label="Pagination">
      ${result.page > 1 ? `<a class="btn btn--quiet btn--sm" href="${pageHref(result.page - 1)}" rel="prev">Previous</a>` : '<span></span>'}
      <p class="muted small">Page ${result.page} of ${result.pages}</p>
      ${result.page < result.pages ? `<a class="btn btn--quiet btn--sm" href="${pageHref(result.page + 1)}" rel="next">Next</a>` : '<span></span>'}
    </nav>`
      : '';

  return `
<div class="wrap page-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> ${ICONS.chevron} <span>Shop</span></nav>
  <h1 class="page-title">${esc(heading)}</h1>
  <p class="muted">${result.total} product${result.total === 1 ? '' : 's'}</p>
</div>

<div class="wrap shop-layout">
  <button class="btn btn--outline filters-toggle" type="button" data-filters-toggle aria-expanded="false" aria-controls="shopFilters">Filters &amp; sort</button>
  <aside class="shop-aside" id="shopFilters">${filters}</aside>
  <div class="shop-main">
    <div class="shop-bar">
      <label class="sort" for="sortSel">Sort
        <select id="sortSel" data-sort>
          ${[['new', 'Newest'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['name', 'Name A–Z']]
            .map(([v, l]) => `<option value="${v}"${(query.sort || 'new') === v ? ' selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </label>
    </div>
    ${grid(result.items, s, `<p><strong>No products match that.</strong></p><p class="muted">Try a different category, widen the price range, or <a href="/shop">clear the filters</a>.</p>`)}
    ${pager}
  </div>
</div>`;
}

export function categoriesPage({ s, cats }) {
  return `
<div class="wrap page-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> ${ICONS.chevron} <span>Categories</span></nav>
  <h1 class="page-title">Categories</h1>
  <p class="muted">Everything we stock, grouped.</p>
</div>
<div class="wrap section">
  <div class="cat-grid cat-grid--lg">
    ${cats
      .map(
        (c) => `<a class="cat-tile" href="/shop?category=${esc(c.slug)}">
      <img src="/uploads/${encodeURIComponent(c.name)}.webp" alt="" loading="lazy" decoding="async" width="1200" height="750">
      <span class="cat-tile__body">
        <span class="cat-tile__name">${esc(c.name)}</span>
        <span class="cat-tile__n">${c.product_count} item${c.product_count === 1 ? '' : 's'}</span>
        ${c.description ? `<span class="cat-tile__desc">${esc(c.description)}</span>` : ''}
      </span>
    </a>`
      )
      .join('')}
  </div>
</div>`;
}

export function productPage({ s, p, related }) {
  const cur = s.currency;
  const imgs = p.images.length ? p.images : [{ filename: '', alt: imgAlt(p) }];

  const thumbs =
    imgs.length > 1
      ? `<ul class="gallery__thumbs">${imgs
          .map(
            (im, i) =>
              `<li><button type="button" class="thumb${i === 0 ? ' thumb--on' : ''}" data-gallery-thumb="${i}">
          <img src="${esc(imgSrc(p, i))}" alt="View ${i + 1} of ${esc(p.name)}" loading="lazy" decoding="async" width="120" height="120">
        </button></li>`
          )
          .join('')}</ul>`
      : '';

  const sizeField = p.sizes.length
    ? `<fieldset class="opt" data-opt="size">
    <legend class="opt__label">Size <span class="opt__req">required</span></legend>
    <div class="opt__choices">
      ${p.sizes
        .map(
          (sz, i) => `<label class="swatch"><input type="radio" name="size" value="${esc(sz)}"${i === 0 ? ' checked' : ''}><span>${esc(sz)}</span></label>`
        )
        .join('')}
    </div>
  </fieldset>`
    : '';

  const colorField = p.colors.length
    ? `<fieldset class="opt" data-opt="color">
    <legend class="opt__label">Colour</legend>
    <div class="opt__choices">
      ${p.colors
        .map(
          (c, i) => `<label class="swatch swatch--color"><input type="radio" name="color" value="${esc(c.name)}" data-hex="${esc(/^#[0-9a-fA-F]{6}$/.test(c.hex || '') ? c.hex : '#8A8A8E')}"${i === 0 ? ' checked' : ''}>
        <span><i style="--sw:${esc(/^#[0-9a-fA-F]{3,8}$/.test(c.hex || '') ? c.hex : '#888888')}"></i>${esc(c.name)}</span></label>`
        )
        .join('')}
    </div>
  </fieldset>`
    : '';

  const stockLine = p.inStock
    ? p.stock <= 5
      ? `<p class="stock stock--low">${ICONS.check} Only ${p.stock} left in the shop</p>`
      : `<p class="stock stock--in">${ICONS.check} In stock</p>`
    : `<p class="stock stock--out">Currently sold out — message us to ask when it returns</p>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    description: p.summary || p.description.slice(0, 300),
    brand: { '@type': 'Brand', name: s.store_name },
    offers: {
      '@type': 'Offer',
      price: String(p.effectivePrice),
      priceCurrency: 'PKR',
      availability: p.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: s.store_name },
    },
  };

  return {
    jsonLd,
    html: `
<div class="wrap">
  <nav class="crumbs crumbs--pdp" aria-label="Breadcrumb">
    <a href="/">Home</a> ${ICONS.chevron}
    <a href="/shop">Shop</a> ${ICONS.chevron}
    ${p.category_slug ? `<a href="/shop?category=${esc(p.category_slug)}">${esc(p.category_name)}</a> ${ICONS.chevron}` : ''}
    <span>${esc(p.name)}</span>
  </nav>
</div>

<div class="wrap pdp">
  <div class="gallery">
    <div class="gallery__main">
      <img data-gallery-main data-has-photos="${p.images.length ? '1' : '0'}" data-placeholder="/placeholder/${esc(p.slug)}.svg" src="${esc(p.images.length ? imgSrc(p) : `/placeholder/${p.slug}.svg` + (p.colors[0] && /^#[0-9a-fA-F]{6}$/.test(p.colors[0].hex) ? `?c=${p.colors[0].hex.slice(1)}` : ``))}" alt="${esc(imgAlt(p))}" width="900" height="1125" fetchpriority="high" decoding="async">
      ${p.onSale ? `<div class="pcard__badges"><span class="badge badge--sale">−${p.discountPct}%</span></div>` : ''}
    </div>
    ${thumbs}
  </div>

  <div class="pdp__info">
    <p class="kicker">${esc(p.category_name || 'QitPit')}</p>
    <h1 class="pdp__title">${esc(p.name)}</h1>
    <p class="pdp__price">
      ${p.onSale
        ? `<span class="price-now">${money(p.sale_price, cur)}</span> <s class="price-was">${money(p.price, cur)}</s> <span class="badge badge--sale">Save ${money(p.price - p.sale_price, cur)}</span>`
        : `<span class="price-now">${money(p.price, cur)}</span>`}
    </p>
    <p class="muted small">SKU ${esc(p.sku)}</p>
    ${stockLine}
    ${p.summary ? `<p class="pdp__summary">${esc(p.summary)}</p>` : ''}

    <form class="pdp__form" data-add-form data-product="${p.id}">
      ${sizeField}
      ${colorField}
      <div class="pdp__buy">
        <div class="qty" role="group" aria-label="Quantity">
          <button class="qty__btn" type="button" data-qty="-1" aria-label="Decrease quantity">−</button>
          <input class="qty__input" type="number" name="qty" value="1" min="1" max="${Math.max(1, Math.min(p.stock, 20))}" inputmode="numeric" aria-label="Quantity">
          <button class="qty__btn" type="button" data-qty="1" aria-label="Increase quantity">+</button>
        </div>
        <button class="btn btn--outline btn--lg pdp__add" type="submit"${p.inStock ? '' : ' disabled'}>
          ${p.inStock ? 'Add to cart' : 'Sold out'}
        </button>
      </div>
      <button class="btn btn--solid btn--lg btn--block pdp__buy-now" type="button" data-buy-now>
        Order now
      </button>
      <p class="pdp__alt">
        <button class="link-btn" type="button" data-wa-product>
          ${ICONS.whatsapp} Prefer WhatsApp? Ask about this item
        </button>
      </p>
      <p class="muted small pdp__note">Cash on delivery available. We confirm every order by phone or WhatsApp before dispatch.</p>
    </form>

    <div class="accordion">
      <details open>
        <summary>Description</summary>
        <div class="prose">${esc(p.description).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').concat('</p>')}</div>
      </details>
      <details>
        <summary>Delivery &amp; collection</summary>
        <div class="prose"><p>${esc(s.delivery_note)}</p><p>Delivery ${money(s.delivery_fee, cur)}${Number(s.free_delivery_over) > 0 ? `, free on orders over ${money(s.free_delivery_over, cur)}` : ''}. Collection from the Chitral shop is free.</p></div>
      </details>
      <details>
        <summary>Sizing help</summary>
        <div class="prose"><p>Not sure of your size? Send a WhatsApp message to ${esc(s.whatsapp_display)} with your usual size and we will tell you how this piece fits before you order.</p></div>
      </details>
    </div>
  </div>
</div>

${related.length ? section('You might also like', null, grid(related, s, '')) : ''}`,
  };
}

export function cartPage({ s }) {
  return `
<div class="wrap page-head">
  <h1 class="page-title">Your cart</h1>
</div>
<div class="wrap cart-layout" data-cart-page>
  <div class="cart-items" data-cart-items>
    <p class="muted">Loading your cart…</p>
  </div>
  <aside class="cart-summary" data-cart-summary hidden>
    <h2 class="footer-h">Summary</h2>
    <dl class="sumline"><dt>Subtotal</dt><dd data-sum-subtotal>—</dd></dl>
    <dl class="sumline"><dt>Delivery</dt><dd data-sum-delivery>—</dd></dl>
    <dl class="sumline sumline--total"><dt>Total</dt><dd data-sum-total>—</dd></dl>
    <p class="muted small" data-sum-note></p>
    <a class="btn btn--solid btn--lg btn--block" href="/checkout">Continue to order</a>
    <a class="btn btn--quiet btn--block" href="/shop">Keep shopping</a>
  </aside>
  <div class="empty" data-cart-empty hidden>
    <p><strong>Your cart is empty.</strong></p>
    <p class="muted">Browse hoodies, jackets, denim, footwear and caps in the shop.</p>
    <a class="btn btn--solid" href="/shop">Go to the shop</a>
  </div>
</div>`;
}

export function checkoutPage({ s, csrf }) {
  const methods = [
    ['cod', 'Cash on delivery', 'Pay the courier in cash when the parcel reaches you. Available across Pakistan.', s.cod_enabled === '1'],
    ['whatsapp', 'Confirm on WhatsApp', 'We send your order to WhatsApp so you can confirm details with us directly.', true],
    ['pickup', 'Collect from the shop', 'Reserve the items and collect them in Chitral. No delivery charge.', true],
    ['bank', 'Bank transfer', s.bank_details || 'We will share account details when we confirm your order.', s.bank_enabled === '1'],
  ].filter(([, , , on]) => on);

  return `
<div class="wrap page-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/cart">Cart</a> ${ICONS.chevron} <span>Order</span></nav>
  <h1 class="page-title">Place your order</h1>
  <p class="muted">No card needed. We confirm every order with you before we send it.</p>
</div>

<div class="wrap checkout" data-checkout>
  <form class="checkout__form" method="post" action="/checkout" novalidate data-checkout-form>
    <input type="hidden" name="csrf" value="${esc(csrf)}">
    <input type="hidden" name="cart" data-cart-payload value="">

    <fieldset class="field-group">
      <legend class="footer-h">Your details</legend>
      <div class="field">
        <label for="cname">Full name <span class="opt__req">required</span></label>
        <input id="cname" name="name" required autocomplete="name" maxlength="80" aria-describedby="cname-err">
        <p class="field__err" id="cname-err" hidden></p>
      </div>
      <div class="field">
        <label for="cphone">Mobile number <span class="opt__req">required</span></label>
        <input id="cphone" name="phone" required inputmode="tel" autocomplete="tel" placeholder="03xx xxxxxxx" maxlength="24" aria-describedby="cphone-err cphone-hint">
        <p class="field__hint" id="cphone-hint">We call or WhatsApp this number to confirm.</p>
        <p class="field__err" id="cphone-err" hidden></p>
      </div>
      <div class="field">
        <label for="ccity">City / town</label>
        <input id="ccity" name="city" autocomplete="address-level2" maxlength="60" placeholder="Chitral">
      </div>
      <div class="field">
        <label for="caddr">Delivery address</label>
        <textarea id="caddr" name="address" rows="3" autocomplete="street-address" maxlength="400" placeholder="House, street, area — leave blank if collecting from the shop"></textarea>
      </div>
      <div class="field">
        <label for="cnotes">Notes for us</label>
        <textarea id="cnotes" name="notes" rows="2" maxlength="400" placeholder="Anything we should know — preferred colour, delivery timing…"></textarea>
      </div>
    </fieldset>

    <fieldset class="field-group">
      <legend class="footer-h">How would you like to pay?</legend>
      ${methods
        .map(
          ([v, label, help], i) => `<label class="method">
        <input type="radio" name="method" value="${v}"${i === 0 ? ' checked' : ''}>
        <span class="method__body"><span class="method__title">${esc(label)}</span><span class="muted small">${esc(help)}</span></span>
      </label>`
        )
        .join('')}
      <p class="muted small">Online card payment is not enabled on this site. Nothing here takes your card details.</p>
    </fieldset>

    <p class="form-error" data-form-error hidden role="alert"></p>
    <button class="btn btn--solid btn--lg btn--block" type="submit" data-submit>Place order</button>
    <p class="muted small">Placing an order sends it to the shop. It is not charged until we confirm with you.</p>
  </form>

  <aside class="checkout__summary">
    <h2 class="footer-h">Your order</h2>
    <div data-checkout-items class="checkout__items"><p class="muted">Loading…</p></div>
    <dl class="sumline"><dt>Subtotal</dt><dd data-sum-subtotal>—</dd></dl>
    <dl class="sumline"><dt>Delivery</dt><dd data-sum-delivery>—</dd></dl>
    <dl class="sumline sumline--total"><dt>Total</dt><dd data-sum-total>—</dd></dl>
    <p class="muted small" data-sum-note></p>
  </aside>
</div>`;
}

export function orderDonePage({ s, order, waHref }) {
  const cur = s.currency;
  return `
<div class="wrap confirm">
  <p class="kicker">Order received</p>
  <h1 class="page-title">Thank you — we have your order.</h1>
  <p class="confirm__ref">Reference <strong>${esc(order.ref)}</strong></p>
  <p>We will contact you on <strong>${esc(order.phone)}</strong> to confirm the items and delivery before anything is dispatched.</p>

  <div class="confirm__box">
    <h2 class="footer-h">What you ordered</h2>
    <ul class="confirm__items">
      ${order.items
        .map(
          (i) => `<li><span>${esc(i.name)}${i.size ? ` · ${esc(i.size)}` : ''}${i.color ? ` · ${esc(i.color)}` : ''} × ${i.qty}</span><span>${money(i.line_total, cur)}</span></li>`
        )
        .join('')}
    </ul>
    <dl class="sumline"><dt>Subtotal</dt><dd>${money(order.subtotal, cur)}</dd></dl>
    <dl class="sumline"><dt>Delivery</dt><dd>${order.delivery ? money(order.delivery, cur) : 'Free'}</dd></dl>
    <dl class="sumline sumline--total"><dt>Total</dt><dd>${money(order.total, cur)}</dd></dl>
  </div>

  <a class="btn btn--wa btn--lg" href="${esc(waHref)}" target="_blank" rel="noopener">${ICONS.whatsapp} Send these details on WhatsApp</a>
  <a class="btn btn--quiet" href="/shop">Continue shopping</a>
  <p class="muted small">Sending on WhatsApp is optional — we already have your order. It just gets us talking faster.</p>
</div>`;
}

export function aboutPage({ s }) {
  return `
<div class="wrap page-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> ${ICONS.chevron} <span>About</span></nav>
  <h1 class="page-title">About ${esc(s.store_name)}</h1>
</div>
<div class="wrap split split__inner split--about">
  <div class="split__copy prose">
    ${s.about_body
      .split(/\n{2,}/)
      .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
      .join('')}
    <a class="btn btn--solid" href="/shop">Browse the shop</a>
  </div>
  <div class="split__media">
    <img src="/uploads/welcoming%20photograph%20of%20a%20modern%2C%20boutique%20clothing%20storefront%20named%20QiT%20PiT%20Center.webp" alt="QitPit, Chitral" loading="lazy" decoding="async" width="800" height="600">
  </div>
</div>`;
}

export function contactPage({ s }) {
  const waHref = `https://wa.me/${encodeURIComponent(s.whatsapp)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    name: s.store_name,
    description: s.tagline,
    address: { '@type': 'PostalAddress', streetAddress: s.address, addressLocality: 'Chitrāl', addressRegion: 'Khyber Pakhtunkhwa', addressCountry: 'PK' },
    telephone: s.phone,
  };
  return {
    jsonLd,
    html: `
<div class="wrap page-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> ${ICONS.chevron} <span>Contact</span></nav>
  <h1 class="page-title">Contact &amp; store</h1>
  <p class="muted">The fastest way to reach us is WhatsApp.</p>
</div>
<div class="wrap contact-grid">
  <a class="contact-card contact-card--wa" href="${esc(waHref)}" target="_blank" rel="noopener">
    ${ICONS.whatsapp}<span class="contact-card__h">${esc(s.whatsapp_display || 'WhatsApp')}</span>
    <span class="muted small">WhatsApp only — orders, sizing and custom requests</span>
  </a>
  <a class="contact-card" href="tel:${esc(s.phone.replace(/\s/g, ''))}">
    ${ICONS.phone}<span class="contact-card__h">${esc(s.phone)}</span><span class="muted small">Call the shop</span>
  </a>
  <div class="contact-card">
    ${ICONS.pin}<span class="contact-card__h">Our address</span><span class="muted small">${esc(s.address)}</span>
    <a class="link-arrow" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(s.map_query)}" target="_blank" rel="noopener">Open in Maps ${ICONS.chevron}</a>
  </div>
  <div class="contact-card">
    ${ICONS.clock}<span class="contact-card__h">Opening hours</span><span class="muted small">${lines(s.hours)}</span>
  </div>
  <div class="contact-card">
    ${ICONS.truck}<span class="contact-card__h">Delivery</span><span class="muted small">${esc(s.delivery_note)}</span>
  </div>
  ${s.instore_payment ? `<div class="contact-card">
    ${ICONS.check}<span class="contact-card__h">Paying in store</span><span class="muted small">${esc(s.instore_payment)}</span>
  </div>` : ''}
  ${s.email && !s.email.startsWith('PLACEHOLDER')
    ? `<a class="contact-card" href="mailto:${esc(s.email)}">${ICONS.check}<span class="contact-card__h">${esc(s.email)}</span><span class="muted small">Email us</span></a>`
    : ''}
</div>
<div class="wrap section">
  <iframe class="map" title="Map showing the location of ${esc(s.store_name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
    src="https://www.google.com/maps?q=${encodeURIComponent(s.map_query)}&output=embed"></iframe>
</div>`,
  };
}

export function errorPage({ s, code, message }) {
  return `
<div class="wrap confirm">
  <p class="kicker">Error ${code}</p>
  <h1 class="page-title">${esc(message)}</h1>
  <p class="muted">The page you asked for is not here. It may have moved, or the product may have sold out and been removed.</p>
  <a class="btn btn--solid btn--lg" href="/shop">Go to the shop</a>
  <a class="btn btn--quiet" href="/">Back home</a>
</div>`;
}
