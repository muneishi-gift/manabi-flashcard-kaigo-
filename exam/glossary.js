// glossary.js – なぞった言葉の意味を出す / 無ければリクエスト送信
(function () {
  'use strict';

  // シート1（gid=0）＝フラッシュカードの日本語モードと同じデータ
  var CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRkTS_qE9X6cIZrofQmV9bDSfQVBAp0IoGbQ6e0esP6UQp_L97pRv4D1LRuv_h-4AGohXtrHALsWtSv/pub?output=csv&gid=0';
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbwZ9ryPnu7Jq23WoyKulycirve1y1358yOEjONbz9fbDOe_LtTrhFCtMz7-JIOkFhtS/exec';

  var COL_NO      = 0;  // A列 No
  var COL_WORD    = 1;  // B列 言葉（漢字・ふりがな）
  var COL_MEANING = 5;  // F列 意味（日本語・ふりがな付）

  var CACHE_KEY   = 'kaigo_glossary_v1';
  var CACHE_HOURS = 24;

  var dict = [];

  /* ---------- ふりがな ---------- */
  function stripFurigana(s) {
    return String(s)
      .replace(/（[ぁ-んー、・\s]+）/g, '')
      .replace(/\([ぁ-んー、・\s]+\)/g, '');
  }

  function furiganaOn() {
    try {
      return !!(window.KaigoStore && window.KaigoStore.getPref('furigana', false));
    } catch (e) { return false; }
  }

  function forDisplay(s) {
    return furiganaOn() ? String(s) : stripFurigana(s);
  }

  /* ---------- 照合用に文字を揃える ---------- */
  function normalize(s) {
    return stripFurigana(s)
      .replace(/[\s\u3000]/g, '')
      .replace(/[、。，．,.]/g, '')
      .replace(/[・･]/g, '')
      .replace(/[（）()【】〔〕「」『』]/g, '')
      .toLowerCase();
  }

  /* ---------- CSV を読む（引用符つきに対応） ---------- */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', inQ = false, i, c;
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; }
          else { inQ = false; }
        } else { cell += c; }
      } else {
        if (c === '"')       { inQ = true; }
        else if (c === ',')  { row.push(cell); cell = ''; }
        else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else                 { cell += c; }
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function buildDict(rows) {
    var out = [];
    rows.slice(1).forEach(function (r) {
      if (!r || !r[COL_WORD]) return;
      var raw  = String(r[COL_WORD]).trim();
      var base = stripFurigana(raw).trim();
      var kana = '';
      var m = raw.match(/（([ぁ-んー、・\s]+)）\s*$/);
      if (m) kana = m[1];
      if (!base) return;
      out.push({
        no:      r[COL_NO] || '',
        raw:     raw,
        base:    base,
        kana:    kana,
        meaning: String(r[COL_MEANING] || '').trim(),
        norm:    normalize(raw)
      });
    });
    return out;
  }

  /* ---------- 保存と読み込み ---------- */
  function loadCache() {
    try {
      var s = localStorage.getItem(CACHE_KEY);
      if (!s) return null;
      var o = JSON.parse(s);
      if (!o || !o.rows) return null;
      dict = buildDict(o.rows);
      return o.at || 0;
    } catch (e) { return null; }
  }

  function saveCache(rows) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows: rows }));
    } catch (e) {}
  }

  function fetchDict(done) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', CSV_URL, true);
    xhr.onload = function () {
      if (xhr.status !== 200) { if (done) done(false); return; }
      var rows = parseCSV(xhr.responseText);
      dict = buildDict(rows);
      saveCache(rows);
      if (done) done(dict.length > 0);
    };
    xhr.onerror = function () { if (done) done(false); };
    xhr.send();
  }

  var at = loadCache();
  var stale = (!at || (Date.now() - at) > CACHE_HOURS * 3600 * 1000);
  if (stale) setTimeout(function () { fetchDict(null); }, 1500);

  /* ---------- 検索（完全一致 → 部分一致 → 無し） ---------- */
  function lookup(q) {
    var n = normalize(q);
    if (!n) return null;

    var exact = [], partial = [], i, d;

    for (i = 0; i < dict.length; i++) {
      if (dict[i].norm === n) exact.push(dict[i]);
    }
    if (exact.length) return { type: 'exact', items: exact.slice(0, 5) };

    for (i = 0; i < dict.length; i++) {
      d = dict[i];
      if (n.length >= 2 && d.norm.indexOf(n) !== -1) { partial.push(d); continue; }
      if (d.norm.length >= 2 && n.indexOf(d.norm) !== -1) partial.push(d);
    }
    if (partial.length) {
      partial.sort(function (a, b) { return a.norm.length - b.norm.length; });
      return { type: 'partial', items: partial.slice(0, 5) };
    }
    return null;
  }

  /* ---------- 表示 ---------- */
  var overlay = null;

  function closeModal() {
    if (overlay) overlay.style.display = 'none';
  }

  function ensureModal() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'gloss-overlay';
    overlay.innerHTML = '<div class="gloss-box" role="dialog" aria-modal="true">'
      + '<div class="gloss-body"></div>'
      + '<button type="button" class="gloss-close">閉じる</button>'
      + '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.className === 'gloss-close') closeModal();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function itemHTML(d) {
    var head = esc(d.base);
    if (d.kana && furiganaOn()) head += '<span class="gloss-kana">（' + esc(d.kana) + '）</span>';
    return '<div class="gloss-item">'
      + '<div class="gloss-word">' + head + '</div>'
      + '<div class="gloss-meaning">' + esc(forDisplay(d.meaning) || '（意味が未登録です）') + '</div>'
      + '</div>';
  }

  function showFound(word, res) {
    var box = ensureModal();
    var body = box.querySelector('.gloss-body');
    var html = '';
    if (res.type === 'partial') {
      html += '<div class="gloss-note">「' + esc(word) + '」に近い言葉が見つかりました</div>';
    }
    res.items.forEach(function (d) { html += itemHTML(d); });

    var jumpWord = (res.items[0] && res.items[0].base) ? res.items[0].base : word;
    var url = '../flashcard.html?word=' + encodeURIComponent(jumpWord) + '&lang=ja';
    html += '<a class="gloss-link" href="' + esc(url) + '">📇 フラッシュカードでくわしく覚える</a>';

    body.innerHTML = html;
    box.style.display = 'flex';
  }

  function showNotFound(word, source) {
    var box = ensureModal();
    var body = box.querySelector('.gloss-body');
    body.innerHTML =
        '<div class="gloss-word">' + esc(word) + '</div>'
      + '<div class="gloss-note">この言葉はまだ用語集にありません。<br>'
      + 'リクエストを送ると、あとから追加されます。</div>'
      + '<button type="button" class="gloss-send">📩 この言葉をリクエストする</button>'
      + '<div class="gloss-feedback"></div>';
    box.style.display = 'flex';

    var btn = body.querySelector('.gloss-send');
    var fb  = body.querySelector('.gloss-feedback');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = '送信中…';
      sendRequest(word, source, function (ok) {
        if (ok) {
          btn.style.display = 'none';
          fb.className = 'gloss-feedback ok';
          fb.textContent = '✅ ありがとうございます！受け付けました';
        } else {
          btn.disabled = false;
          btn.textContent = '📩 この言葉をリクエストする';
          fb.className = 'gloss-feedback ng';
          fb.textContent = '❌ 送信できませんでした。電波の良い場所で再度お試しください';
        }
      });
    });
  }

  function sendRequest(word, source, done) {
    var payload = JSON.stringify({ word: word, source: source || '', from: 'exam' });
    if (window.fetch) {
      fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).then(function () { done(true); }).catch(function () { done(false); });
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', GAS_URL, true);
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
    xhr.onload  = function () { done(true); };
    xhr.onerror = function () { done(false); };
    xhr.send(payload);
  }

  /* ---------- app.js から呼ばれる入口 ---------- */
  window.KaigoAskWord = function (word, q) {
    var source = '';
    if (q) {
      if (q._kai) source += '第' + q._kai + '回 ';
      if (q.id)   source += '問' + q.id;
      source = source.trim();
    }

    if (dict.length === 0) {
      fetchDict(function () {
        var r = lookup(word);
        if (r) showFound(word, r); else showNotFound(word, source);
      });
      return;
    }

    var res = lookup(word);
    if (res) showFound(word, res);
    else     showNotFound(word, source);
  };

  window.KaigoGlossary = {
    size:   function () { return dict.length; },
    reload: function (cb) { fetchDict(cb || null); },
    lookup: lookup
  };

})();
