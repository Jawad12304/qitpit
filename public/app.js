/* QitPit — progressive enhancement. No framework, no dependencies.
   The site renders and navigates fine without this file; it adds the cart,
   the theme toggle, the gallery and the WhatsApp handoff. */

(function () {
  'use strict';

  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var CFG = {
    wa: document.body.dataset.wa || '',
    currency: document.body.dataset.currency || 'Rs',
    fee: Number(document.body.dataset.fee || 0),
    freeOver: Number(document.body.dataset.free || 0)
  };

  var money = function (n) {
    return CFG.currency + ' ' + Number(n || 0).toLocaleString('en-PK');
  };

  // ---------------------------------------------------------------- storage

  var KEY = 'qp-cart';

  function readCart() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v.filter(function (i) { return i && i.id; }) : [];
    } catch (e) { return []; }
  }

  function writeCart(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    paintCount();
    document.dispatchEvent(new CustomEvent('cart:change'));
  }

  function lineKey(i) { return [i.id, i.size || '', i.color || ''].join('|'); }

  function addToCart(entry) {
    var items = readCart();
    var found = items.filter(function (i) { return lineKey(i) === lineKey(entry); })[0];
    if (found) found.qty = Math.min(20, found.qty + entry.qty);
    else items.push(entry);
    writeCart(items);
  }

  function paintCount() {
    var n = readCart().reduce(function (a, i) { return a + (Number(i.qty) || 0); }, 0);
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = n === 0;
    });
  }

  // ---------------------------------------------------------------- toast

  var toastTimer;
  function toast(msg) {
    var el = $('[data-toast]');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { el.hidden = true; }, 240);
    }, 2600);
  }

  // ---------------------------------------------------------------- theme

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('qp-theme', t); } catch (e) {}
  }

  $$('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  });

  // ---------------------------------------------------------------- header

  var navBtn = $('[data-nav-toggle]');
  var nav = $('#mobileNav');
  if (navBtn && nav) {
    navBtn.addEventListener('click', function () {
      var open = nav.hidden;
      nav.hidden = !open;
      navBtn.setAttribute('aria-expanded', String(open));
      $('.sr-only', navBtn).textContent = open ? 'Close menu' : 'Open menu';
      document.body.classList.toggle('nav-open', open);
    });
  }

  var searchBtn = $('[data-search-toggle]');
  var searchPanel = $('#searchPanel');
  if (searchBtn && searchPanel) {
    searchBtn.addEventListener('click', function () {
      var open = searchPanel.hidden;
      searchPanel.hidden = !open;
      searchBtn.setAttribute('aria-expanded', String(open));
      if (open) $('#siteSearch').focus();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (nav && !nav.hidden) navBtn.click();
    if (searchPanel && !searchPanel.hidden) searchBtn.click();
  });

  // ---------------------------------------------------------------- shop

  var filtersBtn = $('[data-filters-toggle]');
  var aside = $('#shopFilters');
  if (filtersBtn && aside) {
    filtersBtn.addEventListener('click', function () {
      var open = !aside.classList.contains('is-open');
      aside.classList.toggle('is-open', open);
      filtersBtn.setAttribute('aria-expanded', String(open));
    });
  }

  var sortSel = $('[data-sort]');
  if (sortSel) {
    sortSel.addEventListener('change', function () {
      var u = new URL(location.href);
      u.searchParams.set('sort', sortSel.value);
      u.searchParams.delete('page');
      location.href = u.toString();
    });
  }

  // ---------------------------------------------------------------- gallery

  var main = $('[data-gallery-main]');
  if (main) {
    $$('[data-gallery-thumb]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var img = $('img', btn);
        main.src = img.src;
        main.alt = img.alt;
        $$('[data-gallery-thumb]').forEach(function (b) { b.classList.remove('thumb--on'); });
        btn.classList.add('thumb--on');
      });
    });
  }

  // ---------------------------------------------------------------- quantity

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-qty]');
    if (!btn) return;
    var input = $('.qty__input', btn.parentNode);
    if (!input) return;
    var min = Number(input.min || 1);
    var max = Number(input.max || 20);
    input.value = Math.min(max, Math.max(min, (Number(input.value) || min) + Number(btn.dataset.qty)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---------------------------------------------------------------- add to cart

  function formEntry(form) {
    var checked = function (name) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : '';
    };
    return {
      id: Number(form.dataset.product),
      qty: Math.max(1, Number($('.qty__input', form) ? $('.qty__input', form).value : 1) || 1),
      size: checked('size'),
      color: checked('color')
    };
  }

  // Selecting a colour retints the stand-in image, so the choice is visible
  // even before the shop uploads real photographs. Real photos are left alone.
  function paintColour(form) {
    if (!main || main.dataset.hasPhotos === '1') return;
    var picked = form.querySelector('input[name="color"]:checked');
    if (!picked) return;
    var hex = (picked.dataset.hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return;
    main.src = main.dataset.placeholder + '?c=' + hex;
    main.alt = picked.value + ' — ' + (document.querySelector('.pdp__title') || {}).textContent;
  }

  var addForm = $('[data-add-form]');
  if (addForm) {
    addForm.addEventListener('change', function (e) {
      if (e.target.name === 'color') paintColour(addForm);
    });
    paintColour(addForm);

    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      addToCart(formEntry(addForm));
      toast('Added to your cart');
    });

    // "Order now" is a straight buy-now: put this item in the cart and go
    // to checkout, rather than leaving the shopper to find the cart.
    var buyNow = $('[data-buy-now]', addForm);
    if (buyNow) {
      buyNow.addEventListener('click', function () {
        addToCart(formEntry(addForm));
        location.href = '/checkout';
      });
    }

    var waBtn = $('[data-wa-product]', addForm);
    if (waBtn) {
      waBtn.addEventListener('click', function () {
        var entry = formEntry(addForm);
        var name = $('.pdp__title').textContent.trim();
        var price = $('.pdp__price .price-now').textContent.trim();
        var lines = [
          'Assalam-o-alaikum, I would like to order from QitPit:',
          '',
          'Item: ' + name,
          entry.size ? 'Size: ' + entry.size : '',
          entry.color ? 'Colour: ' + entry.color : '',
          'Quantity: ' + entry.qty,
          'Price: ' + price,
          '',
          'Link: ' + location.href
        ].filter(Boolean);
        openWhatsApp(lines.join('\n'));
      });
    }
  }

  function openWhatsApp(text) {
    if (!CFG.wa) { toast('WhatsApp number is not configured yet'); return; }
    window.open('https://wa.me/' + encodeURIComponent(CFG.wa) + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  // Quick add from a product grid.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-quick-add]');
    if (!btn) return;
    e.preventDefault();
    // Anything with sizes must be chosen properly on the product page.
    if (btn.hasAttribute('data-needs-options')) {
      location.href = '/product/' + btn.dataset.slug;
      return;
    }
    addToCart({ id: Number(btn.dataset.quickAdd), qty: 1, size: '', color: '' });
    toast('Added to your cart');
  });

  // ---------------------------------------------------------------- cart pricing

  // The server is the only source of prices. The browser stores ids and
  // options; every total shown comes back from /api/cart.
  function priceCart() {
    var items = readCart();
    if (!items.length) return Promise.resolve({ lines: [], subtotal: 0 });
    return fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    })
      .then(function (r) { return r.ok ? r.json() : { lines: [], subtotal: 0 }; })
      .catch(function () { return { lines: [], subtotal: 0 }; });
  }

  function deliveryFor(subtotal, method) {
    if (method === 'pickup') return 0;
    if (CFG.freeOver > 0 && subtotal >= CFG.freeOver) return 0;
    return CFG.fee;
  }

  function paintTotals(subtotal, method) {
    var delivery = deliveryFor(subtotal, method);
    $$('[data-sum-subtotal]').forEach(function (el) { el.textContent = money(subtotal); });
    $$('[data-sum-delivery]').forEach(function (el) { el.textContent = delivery ? money(delivery) : 'Free'; });
    $$('[data-sum-total]').forEach(function (el) { el.textContent = money(subtotal + delivery); });
    $$('[data-sum-note]').forEach(function (el) {
      var short = CFG.freeOver - subtotal;
      el.textContent =
        method === 'pickup' ? 'Collection from the Chitral shop — no delivery charge.'
        : delivery === 0 ? 'Delivery is free on this order.'
        : CFG.freeOver > 0 && short > 0 ? 'Add ' + money(short) + ' more for free delivery.'
        : '';
    });
    return delivery;
  }

  var esc = function (str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ---------------------------------------------------------------- cart page

  if ($('[data-cart-page]')) {
    var listEl = $('[data-cart-items]');
    var summaryEl = $('[data-cart-summary]');
    var emptyEl = $('[data-cart-empty]');

    var renderCart = function () {
      priceCart().then(function (data) {
        var lines = data.lines || [];
        var has = lines.length > 0;
        summaryEl.hidden = !has;
        emptyEl.hidden = has;
        listEl.hidden = !has;

        listEl.innerHTML = lines.map(function (l) {
          var opts = [l.size, l.color].filter(Boolean).join(' · ');
          return '<div class="cart-row" data-key="' + esc(l.key) + '">' +
            '<a href="/product/' + esc(l.slug) + '"><img src="' + esc(l.image) + '" alt="' + esc(l.name) + '" width="110" height="138" loading="lazy"></a>' +
            '<div>' +
              '<a class="cart-row__name" href="/product/' + esc(l.slug) + '">' + esc(l.name) + '</a>' +
              '<p class="cart-row__opts">' + (opts ? esc(opts) + ' · ' : '') + money(l.unit_price) + ' each' +
                (l.capped ? ' · <strong>only ' + l.stock + ' in stock</strong>' : '') + '</p>' +
              '<div class="cart-row__foot">' +
                '<div class="qty" role="group" aria-label="Quantity for ' + esc(l.name) + '">' +
                  '<button class="qty__btn" type="button" data-qty="-1" aria-label="Decrease">−</button>' +
                  '<input class="qty__input" type="number" value="' + l.qty + '" min="1" max="' + l.stock + '" inputmode="numeric" data-line-qty aria-label="Quantity">' +
                  '<button class="qty__btn" type="button" data-qty="1" aria-label="Increase">+</button>' +
                '</div>' +
                '<span class="cart-row__price">' + money(l.line_total) + '</span>' +
                '<button class="cart-remove" type="button" data-remove>Remove</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');

        paintTotals(data.subtotal, 'cod');
      });
    };

    listEl.addEventListener('change', function (e) {
      var input = e.target.closest('[data-line-qty]');
      if (!input) return;
      var key = input.closest('.cart-row').dataset.key;
      var items = readCart();
      var row = items.filter(function (i) { return lineKey(i) === key; })[0];
      if (row) {
        row.qty = Math.max(1, Math.min(Number(input.max) || 20, Number(input.value) || 1));
        writeCart(items);
      }
    });

    listEl.addEventListener('click', function (e) {
      if (!e.target.closest('[data-remove]')) return;
      var key = e.target.closest('.cart-row').dataset.key;
      writeCart(readCart().filter(function (i) { return lineKey(i) !== key; }));
      toast('Removed from cart');
    });

    document.addEventListener('cart:change', renderCart);
    renderCart();
  }

  // ---------------------------------------------------------------- checkout

  var checkout = $('[data-checkout]');
  if (checkout) {
    var form = $('[data-checkout-form]');
    var itemsEl = $('[data-checkout-items]');
    var errEl = $('[data-form-error]');
    var submitBtn = $('[data-submit]');
    var subtotalNow = 0;

    var currentMethod = function () {
      var el = form.querySelector('input[name="method"]:checked');
      return el ? el.value : 'cod';
    };

    var renderSummary = function () {
      priceCart().then(function (data) {
        var lines = data.lines || [];
        subtotalNow = data.subtotal || 0;
        if (!lines.length) {
          itemsEl.innerHTML = '<p class="muted">Your cart is empty. <a href="/shop">Go to the shop</a>.</p>';
          submitBtn.disabled = true;
          paintTotals(0, currentMethod());
          return;
        }
        submitBtn.disabled = false;
        itemsEl.innerHTML = '<ul>' + lines.map(function (l) {
          var opts = [l.size, l.color].filter(Boolean).join(' · ');
          return '<li><span>' + esc(l.name) + (opts ? ' · ' + esc(opts) : '') + ' × ' + l.qty + '</span>' +
                 '<span>' + money(l.line_total) + '</span></li>';
        }).join('') + '</ul>';
        paintTotals(subtotalNow, currentMethod());
      });
    };

    form.addEventListener('change', function (e) {
      if (e.target.name === 'method') paintTotals(subtotalNow, currentMethod());
    });

    var showFieldError = function (id, msg) {
      var input = $('#' + id);
      var out = $('#' + id + '-err');
      input.closest('.field').classList.toggle('is-invalid', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (out) { out.textContent = msg || ''; out.hidden = !msg; }
      return !msg;
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errEl.hidden = true;

      var name = $('#cname').value.trim();
      var phone = $('#cphone').value.trim();
      var okName = showFieldError('cname', name.length < 2 ? 'Please tell us your name.' : '');
      // Pakistani mobile numbers: 10-13 digits once separators are stripped.
      var digits = phone.replace(/\D/g, '');
      var okPhone = showFieldError('cphone', digits.length < 10 || digits.length > 13
        ? 'Enter a valid mobile number, for example 0300 1234567.' : '');

      if (!okName || !okPhone) {
        (okName ? $('#cphone') : $('#cname')).focus();
        return;
      }

      var items = readCart();
      if (!items.length) {
        errEl.textContent = 'Your cart is empty.';
        errEl.hidden = false;
        return;
      }

      $('[data-cart-payload]').value = JSON.stringify(items);
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending your order…';
      form.submit();
    });

    document.addEventListener('cart:change', renderSummary);
    renderSummary();
  }

  // The order landed on the server; the browser copy has done its job.
  if (document.body.dataset.clearCart === '1') writeCart([]);

  paintCount();
})();
