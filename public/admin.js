/* QitPit admin — theme toggle, delete confirmations, image uploads.
   Everything except image upload works without this file. */

(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

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
    }, 3000);
  }

  // ---------------------------------------------------------------- theme

  $$('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('qp-theme', next); } catch (e) {}
    });
  });

  // ---------------------------------------------------------------- confirmations

  // Destructive actions always ask first.
  $$('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  // ---------------------------------------------------------------- uploads

  var box = $('[data-uploader]');
  if (!box) return;

  var productId = box.dataset.product;
  var csrf = box.dataset.csrf;
  var input = $('[data-file-input]', box);
  var zone = $('[data-dropzone]', box);
  var list = $('[data-image-list]', box);
  var log = $('[data-upload-list]', box);

  var MAX = 5 * 1024 * 1024;
  var TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  function note(msg) {
    var p = document.createElement('p');
    p.textContent = msg;
    log.appendChild(p);
    return p;
  }

  function upload(file) {
    if (TYPES.indexOf(file.type) === -1) {
      note(file.name + ' — not a JPEG, PNG or WebP.');
      return Promise.resolve();
    }
    if (file.size > MAX) {
      note(file.name + ' — larger than 5 MB.');
      return Promise.resolve();
    }

    var line = note(file.name + ' — uploading…');

    return fetch('/admin/upload/' + productId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF': csrf },
      body: file
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { line.textContent = file.name + ' — ' + (res.data.error || 'upload failed'); return; }
        line.remove();

        var fig = document.createElement('figure');
        var img = document.createElement('img');
        img.src = res.data.url;
        img.alt = res.data.alt;
        img.width = 110;
        img.height = 138;
        var del = document.createElement('button');
        del.className = 'btn btn--danger btn--sm';
        del.type = 'button';
        del.dataset.deleteImage = res.data.id;
        del.textContent = 'Delete';
        fig.appendChild(img);
        fig.appendChild(del);
        list.appendChild(fig);
        toast('Photograph added');
      })
      .catch(function () { line.textContent = file.name + ' — upload failed. Check your connection.'; });
  }

  function uploadAll(files) {
    // One at a time: kinder to a slow connection than a burst of parallel PUTs.
    Array.prototype.slice.call(files).slice(0, 12).reduce(function (chain, f) {
      return chain.then(function () { return upload(f); });
    }, Promise.resolve());
  }

  input.addEventListener('change', function () {
    uploadAll(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); });
  });
  zone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) uploadAll(e.dataTransfer.files);
  });

  list.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-deleteImage], [data-delete-image]');
    if (!btn) return;
    if (!window.confirm('Delete this photograph?')) return;

    var id = btn.dataset.deleteImage;
    fetch('/admin/images/' + id + '/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'csrf=' + encodeURIComponent(csrf)
    })
      .then(function (r) {
        if (!r.ok) throw new Error();
        btn.closest('figure').remove();
        toast('Photograph deleted');
      })
      .catch(function () { toast('Could not delete that photograph'); });
  });
})();
