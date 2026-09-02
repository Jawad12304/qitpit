# QiT PiT Center

Storefront and admin panel for **QiT PiT Center** — a fashion and lifestyle shop
in Shahi Bazar, Chitrāl, near Dakhana Chowk, Khyber Pakhtunkhwa.

Trending outfits, footwear and accessories for **men and women**: premium
hoodies and cotton fleece sets, winter zipper jackets, denim, long coats, cargo
trousers, graphic tees, handmade Panjadar leather sandals, caps and clutches.

Includes a shopping cart, an order-request checkout built for the Pakistani
market (cash on delivery, WhatsApp, shop collection, bank transfer), and a full
admin panel the shop owner can run without touching code.

**Store details**
| | |
|---|---|
| Address | Shahi Bazar, near Dakhana Chowk, Chitrāl, KPK (Plus Code `VQ3P+3V`) |
| Phone | +92 333 5865314 |
| WhatsApp orders | 0346-0150880 — **WhatsApp only**, a different number from the phone line |
| Hours | Mon 9:45–20:00 · Tue 10:05–20:00 · Wed 10:10–20:00 · Thu–Sat 10:00–20:00 · Sun 10:05–20:00 |
| In store | Cash only |
| Delivery | Cash on delivery / parcel, all over Pakistan |

---

## Technology

| Layer | Choice |
|---|---|
| Runtime | Node.js 22.5+ (built and tested on Node 24) |
| Server | `node:http` — no framework |
| Database | `node:sqlite` — built into Node, no driver to install |
| Auth | `node:crypto` — scrypt hashing, server-side sessions |
| Templates | Server-rendered HTML from tagged template literals |
| Client JS | ~420 lines of vanilla JS, progressive enhancement |
| Build step | none |
| npm dependencies | **one** — `nodemailer`, itself dependency-free, loaded only if order email is configured |

**Why not PHP/MySQL:** neither is installed in this environment, and neither is
needed. Node 24 ships SQLite in core, so the application needs no compiler and
no database server to administer. The only npm package is `nodemailer`, which
has no dependencies of its own; if you skip `npm install`, everything still runs
and order email simply stays off. For a single shop's catalogue this is faster, cheaper to host and
far less to keep patched. It deploys to any VPS, or to Railway/Render/Fly.

---

## Project structure

```
QitPit/
├── server.js          HTTP server, router, security headers, public routes, SEO
├── db.js              Schema, migrations, seed data, all queries
├── auth.js            Password hashing, sessions, CSRF, rate limiting
├── views.js           Public site templates and shared helpers
├── admin.js           Admin routes and admin templates
├── create-admin.js    CLI to create or reset an admin account
├── notify.js          Order notification email (optional)
├── env.js             Loads .env before anything reads process.env
├── test-email.js      `npm run test-email` — verify SMTP before going live
├── make-logo.py       Rebuilds the logo PNGs from logo files/logo.jpg
├── public/
│   ├── styles.css     Design tokens + every style (site and admin)
│   ├── app.js         Storefront JS — cart, theme, gallery, checkout
│   └── admin.js       Admin JS — uploads, confirmations, theme
├── data/              SQLite database + generated secret   (gitignored)
├── uploads/           Product photographs                  (gitignored)
├── package.json       No dependencies; `"type": "module"`
├── .env.example
└── README.md
```

Fifteen source files. Nothing is split for the sake of splitting, and nothing
shares a file that shouldn't.

---

## Brand assets

The site uses **your supplied logo** (`logo files/logo.jpg`), not a generated
stand-in. The source is a gold mark on a white JPEG; a build step keyed the white
out to alpha so a single file works on both themes, and cut the pieces the site
needs.

| File | Size | Use |
|---|---|---|
| `public/logo-mark.png` | 204×240 | The monogram alone — site header, admin top bar |
| `public/logo.png` | 410×560 | Full lockup with the "Head to toe, Qit Pit" strapline — site footer, admin sign-in |
| `public/logo-icon.png` | 512×512 | Monogram on a dark rounded ground — favicon and Apple touch icon |

All three are transparent PNGs in the logo's own gold, **#BEA06E**, sampled from
the artwork.

`brandMark()` in `views.js` is the single place that emits the logo:
`brandMark()` gives the emblem plus the "QiT PiT Center" wordmark, and
`brandMark({ full: true })` gives the lockup image.

### Two things to know about this artwork

**It is a tall display mark**, so it is used at modest sizes and paired with the
`QiT PiT Center` wordmark rather than carrying the header alone:

| Placement | Height |
|---|---|
| Site header (desktop) | 30px, in a 69px header |
| Site header (mobile) | 26px, in a 61px header |
| Admin top bar | 24px |
| Site footer lockup | 74px |
| Admin sign-in lockup | 62px |

Below roughly 24px the fine strokes thin out and the letterforms stop reading —
if you need it smaller anywhere, it wants a simplified variant drawn for small
sizes rather than a further reduction.

**The gold cannot be used for text.** #BEA06E on the light background is 2.36:1,
well under the 4.5:1 WCAG AA needs. So the logo keeps its gold, while links and
accents use a darkened version of the same hue — `#8A6832` (4.86:1) in light,
and the true brand gold `#BEA06E` (7.7:1) in dark, where it passes comfortably.
Both are set as `--accent`; `--brand-gold` holds the untouched logo colour.

### Regenerating

`logo.ai` and `logo files/logo.jpg` are the masters and stay in the project. If
the logo changes, replace `logo files/logo.jpg` and re-run the extraction
described above to rebuild the three PNGs.

---

## Database

SQLite, foreign keys on, WAL journal, indexed on every column used for lookup
or sorting.

| Table | Purpose |
|---|---|
| `admins` | id, email (unique), name, `password_hash`, created/last-login |
| `sessions` | id (random 256-bit), admin_id → admins, csrf token, expiry |
| `categories` | id, slug (unique), name, description, sort_order, active |
| `products` | id, sku, slug (both unique), name, category_id → categories, summary, description, price, sale_price, stock, sizes (JSON), colors (JSON), featured, is_new, published, timestamps |
| `product_images` | id, product_id → products **(cascade delete)**, filename, alt, sort_order |
| `orders` | id, ref (unique), customer name/phone/city/address/notes, method, subtotal, delivery_fee, total, status, timestamps |
| `order_items` | id, order_id → orders **(cascade)**, product_id → products (set null), plus a **snapshot** of name/sku/size/colour/price so history survives catalogue edits |
| `settings` | key/value store for all editable content and configuration |

Prices are whole rupees stored as `INTEGER` — no floating-point money.

---

## Admin panel — `/admin`

- **Dashboard** — published/out-of-stock counts, new orders, order value, latest
  orders, low-stock list, and a warning banner listing any contact detail still
  set to a placeholder.
- **Products** — search, filter by category, paginated list. Create, edit,
  duplicate, delete. Price, sale price, stock, sizes, colours, category,
  description. Toggles for published / featured / new arrival. Sale status is
  derived from the sale price rather than being a separate switch to forget.
- **Photographs** — drag-and-drop or tap-to-choose, multiple files, per-image
  delete. First image is the main one.
- **Categories** — add, rename, describe, reorder, show/hide, delete. Deleting a
  category keeps its products (they become uncategorised).
- **Orders** — search by reference, name or phone; filter by status; full order
  detail with a one-tap "Message on WhatsApp" that pre-fills a confirmation to
  that customer; status workflow `new → confirmed → packed → shipped → delivered`
  (or `cancelled`).
- **Homepage & content** — hero headline, sub-line and both buttons; the
  promotional band; the About page text.
- **Store settings** — store name, tagline, phone, WhatsApp, email, address, map
  location, opening hours, Instagram/Facebook, currency, delivery charge, free
  delivery threshold, delivery note, payment methods offered, default theme.
- **Your account** — change password (which signs out every other session).

Destructive actions confirm first. Every form is a plain HTML form that works
before JavaScript loads.

---

## Public site

Home · Shop · Categories · Product detail · Cart · Checkout · Order confirmation
· About · Contact.

- Search, category filter, price range, four sort orders, pagination, and
  designed empty states.
- Product pages with image gallery, size and colour selectors, stock status,
  quantity, add-to-cart, WhatsApp ordering, description, delivery info and
  related products.
- Cart persists in `localStorage`; **prices are always recomputed on the server**
  (`POST /api/cart`), so a tampered cart cannot change what anything costs.
- Checkout offers cash on delivery, WhatsApp confirmation, shop collection and
  bank transfer. **No card payment is implemented and none is implied** — the
  checkout says so explicitly. Adding a gateway later means one new payment
  method, not a rewrite.
- Every order is stored in the database first; the WhatsApp handoff is an
  optional convenience on top, not the record.

---

## Order notification email

When a customer places an order, the shop owner gets an email with the customer's
name and phone, the items with size and colour, the totals, a **Message the
customer on WhatsApp** button, and a link straight to the order in the admin
panel.

It is **entirely optional**. With nothing configured the site behaves exactly as
before, and the startup banner tells you it is off and which variables are
missing.

### Setting it up

Add to `.env` (see `.env.example`), then restart:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourshop@gmail.com
SMTP_PASS=your-16-character-app-password
ORDER_EMAIL_TO=where-you-read-mail@example.com
ORDER_EMAIL_FROM=yourshop@gmail.com
```

Then check it before relying on it:

```
npm run test-email
```

That verifies the connection and sends a real test message, so you find out
about a wrong password now rather than when the first order arrives.

**Gmail:** App Passwords require 2-Step Verification to be switched on first
(Google Account → Security → 2-Step Verification → App Passwords). Gmail also
caps sending at roughly 500/day. Any SMTP provider works — a mailbox on your own
domain is usually the steadier choice.

### Three deliberate design decisions

**The email is never awaited.** It is fired after the order is committed and the
response goes out immediately. A slow or dead mail server cannot delay a
checkout, and cannot fail one whose order is already saved. Measured with SMTP
pointed at an unroutable address: checkout still returned in ~310ms, the order
saved, and the failure was logged 10 seconds later as `[email] FAILED for order
… Connection timeout`.

**The admin panel stays the source of truth.** Email is a push notification on
top of the database, never the record. If mail is misconfigured you lose the
alert, not the order — the email itself says so.

**Customers are not emailed, because we never ask for an address.** Checkout
collects name, phone and delivery address only, which is the right amount of
friction for this market. The customer channel is WhatsApp and phone; this
feature is owner-notification only.

### Configuration is read at startup

`.env` is loaded by `env.js`, which is imported before anything that reads
`process.env`. Change `.env` → restart the server. Secrets live only in `.env`,
which is gitignored, and the SMTP password is never logged.

---

## Security

| Area | Measure |
|---|---|
| Passwords | scrypt (N=16384), 16-byte random salt per user, constant-time compare. Minimum 12 chars with mixed case and a digit; common words rejected. Never stored or logged in plaintext. |
| Sessions | 256-bit random id, server-side record, 8-hour expiry, hourly purge. Cookie is `HttpOnly`, `SameSite=Strict`, `Path=/admin`, and `Secure` in production. |
| CSRF | Per-session random token required on every admin POST, compared in constant time. Uploads carry it in an `X-CSRF` header. A token from one session is rejected by another. |
| Authorization | Every route past login re-checks the session; there is no "secret URL" access. |
| SQL | Prepared statements everywhere. The only non-parameterised SQL is an `ORDER BY` chosen from a fixed whitelist. |
| XSS | Every interpolated value passes through `esc()`. Strict CSP with a per-request nonce; no inline event handlers anywhere. |
| Uploads | Magic-byte sniffing (JPEG/PNG/WebP only — the `Content-Type` header and filename are ignored), 5 MB cap, server-generated random filename, fixed `Content-Type` on serve, `nosniff`. A PHP file renamed `.png` is rejected. |
| Rate limiting | Login 8 per 15 min per IP, orders 8 per 10 min, uploads 60 per 10 min. |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, HSTS in production. |
| Order links | Confirmation URLs are HMAC-signed; order references cannot be enumerated. |
| Phone handling | WhatsApp numbers are normalised to international format on save (`0346-0150880` → `923460150880`), so a locally-typed number cannot silently break every order link. |
| Secrets | Nothing hard-coded. `data/` and `uploads/` are gitignored; the signing secret is generated to `data/.secret` (mode 600) or supplied via `APP_SECRET`. |
| Errors | Stack traces are logged server-side only; users see a plain error page. |

Verified by test: cross-session CSRF reuse → 403 · forged session cookie →
redirect to login · PHP webshell as `.png` → 415 · 6 MB upload → 413 ·
`'; DROP TABLE products;--` → catalogue intact · client-supplied prices → ignored
· `javascript:` social URL → rejected · unknown settings keys → not stored.

---

## Light and dark themes

Two separately authored palettes, not an inversion. Light is a warm off-white
(`#FAF9F7`) with near-black text; dark is a warm charcoal (`#0F0F11` / `#17171A`)
— deliberately not pure black, so product photography still reads. The brass
accent lightens from `#8A5A2B` to `#CB9A5E` in dark so it keeps its contrast
ratio, and sale red lightens likewise.

Everything is driven by CSS custom properties on `:root` and
`:root[data-theme='dark']`. The toggle sits in the header, the choice persists in
`localStorage`, and an inline nonce'd script in `<head>` applies it before first
paint so there is no flash. The shop owner sets the default for new visitors in
Store settings.

---

## Responsive behaviour

Mobile-first, with breakpoints at 560 / 768 / 1024 / 1440px. Product grid goes
2 → 3 → 4 columns; shop filters are a toggle drawer on mobile and a sticky
sidebar from 1024px; the product gallery becomes sticky beside the details; the
admin sidebar is a horizontal scroll strip on mobile and a fixed rail on desktop.

Verified with Chrome DevTools emulation at 320, 360, 390, 768, 1024, 1440 and
1920px: **no page scrolls horizontally at any width** (`scrollWidth ===
clientWidth` everywhere, storefront and admin).

Touch targets are ≥44px. `prefers-reduced-motion` and `prefers-contrast` are
honoured.

---

## Accessibility

Semantic landmarks, one `<h1>` per page, skip link, visible focus rings on every
interactive element, labels on every field, `aria-current` on the active nav
item, `aria-invalid` plus text errors on invalid fields, live-region toasts,
alt text on every image, and colour never used as the only signal. Icons are
inline SVG — no emoji as UI.

---

## SEO

Per-page titles and meta descriptions, canonical URLs, Open Graph and Twitter
card tags, `ClothingStore` structured data on home and contact (real address,
region and phone from settings), `Product` structured data with price,
`priceCurrency: PKR` and availability, a generated `sitemap.xml` covering all
products and categories, and a `robots.txt` that disallows `/admin`, `/api/` and
`/order/`.

Copy targets the real search intent — *men's clothing Chitral*, *shirts Chitral*,
*jeans Chitral* — through natural page titles and headings, not keyword stuffing.

---

## External dependencies

**Runtime code: none.** Two optional network resources, both degrading cleanly:

- **Google Fonts** (Playfair Display + Inter). Full local fallback stacks are
  declared, so the site is fully usable offline or on a slow connection. To
  self-host, download the woff2 files into `public/` and swap the `<link>` for an
  `@font-face` block.
- **Google Maps embed** on the Contact page — an `<iframe>` with no API key,
  allowed explicitly in the CSP.

---

## Configuration you need to provide

Nothing is required to run it locally. Before going live, set these in
**Admin → Store settings** (the dashboard shows a banner until you do):

| Setting | Status |
|---|---|
| Phone, WhatsApp, address, map location, hours | **Filled in** with your real details |
| Email | still `PLACEHOLDER` — set it or leave it; the contact card hides itself when unset |
| Instagram / Facebook | empty; links stay hidden until filled |
| WhatsApp Channel link | empty; add your broadcast catalogue URL |
| Delivery charge / free threshold | Rs 250 / Rs 5,000 — **example figures, set your real terms** |
| Product prices | **example figures** — replace with your real prices |

The dashboard shows a red banner listing anything still on a placeholder.

And in `.env` for production: `SITE_URL`, `NODE_ENV=production`, `APP_SECRET`.

---

## Running locally

```bash
node --version          # must be 22.5 or newer
node server.js          # http://localhost:3000
```

That is the whole setup. No install step. The database, schema, seven
categories and a small demo catalogue are created on first run.

`npm run dev` restarts on file changes.

---

## Creating the first admin account

```bash
node create-admin.js
```

Prompts for email, name and password. The password is typed at the terminal and
never echoed, so it does not reach your shell history or the process list. It is
scrypt-hashed before it touches disk. Run the same command against an existing
email to reset that password — which also signs out every session for that
account.

Then sign in at `/admin`.

---

## Deploying

1. Copy the project to the server (exclude `data/` and `uploads/`).
2. `cp .env.example .env` and fill in `SITE_URL`, `NODE_ENV=production` and a
   generated `APP_SECRET`.
3. Run behind nginx or Caddy with TLS, proxying to `HOST=127.0.0.1`. This is
   what enables `Secure` cookies and HSTS.
4. Keep it alive with systemd or `pm2`.
5. `node create-admin.js`, sign in, fill in Store settings, replace the demo
   products with real stock and photographs.
6. **Back up `data/` and `uploads/`** — together they are the entire shop.
   `sqlite3 data/qitpit.db ".backup 'backup.db'"` on a cron job is enough.

---

## Remaining placeholders

- **Email address** — the only contact detail still unset. Everything else
  (phone, WhatsApp, address, Plus Code, hours) is your real information.
- **Prices** — every price in the seeded catalogue is an example. So are the
  Rs 250 delivery charge and the Rs 5,000 free-delivery threshold.
- **Product photography** — every product currently shows a generated SVG tile
  with its initials. These are not stock photos and are never mistaken for the
  product; upload real photographs from the admin panel and they are replaced
  automatically. Portrait 4:5 is the target ratio.
- **Demo catalogue** — 17 products across 9 categories, named after the lines
  you actually stock (fleece hoodies, zipper jackets, long coats, cargo
  trousers, Panjadar sandals, washed caps, ladies' clutches) so the site is
  never empty on first run. Prices are placeholders. Delete or edit them once
  your real stock is in.
- **Hero, promo and About copy** — written to be usable as-is and editable in
  Admin → Homepage & content.

Nothing on the site fabricates reviews, ratings, customer counts, years in
business, awards or delivery guarantees. The only claims made are ones the
settings let you make truthfully.
