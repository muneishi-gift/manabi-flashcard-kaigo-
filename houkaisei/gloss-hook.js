/* =========================================================
   houkaisei/gloss-hook.js
   法改正まるわかりノートで「単語をなぞる → 意味 → フラッシュカード
   ／無い言葉はリクエスト送信」を過去問と同じ形で動かす。
   ・意味の本体は ../exam/glossary.js（過去問と同じ用語集）
   ・見た目はこのファイルの中で用意（houkaisei.css は触らない）
   Created by Mitsuhide Muneishi
   ========================================================= */
(function () {
  'use strict';

  var MIN_LEN = 2;    // これより短い選択は無視
  var MAX_LEN = 30;   // 長い文章の選択は無視（誤作動を防ぐ）

  /* ---------------------------------------------------------
     1. 見た目
        exam/style.css の .gloss-* と同じクラス名を使いつつ、
        色は --gl-* という独自の変数で持つので houkaisei.css と
        ぶつからない。
     --------------------------------------------------------- */
  var CSS = ''
  + ':root{'
  +   '--gl-paper:#FFFFFF; --gl-ink:#1F2328; --gl-sub:#4A5158;'
  +   '--gl-line:rgba(31,35,40,.20); --gl-soft:rgba(31,35,40,.06);'
  +   '--gl-accent:#6D28D9; --gl-accent2:#1D4ED8;'
  +   '--gl-shadow:rgba(31,35,40,.28); --gl-ok:#0E7C86; --gl-ng:#C2410C;'
  + '}'
  + ':root[data-theme="dark"]{'
  +   '--gl-paper:#221F3F; --gl-ink:#EDEFF4; --gl-sub:rgba(237,239,244,.82);'
  +   '--gl-line:rgba(255,255,255,.22); --gl-soft:rgba(255,255,255,.09);'
  +   '--gl-accent:#a78bfa; --gl-accent2:#60a5fa;'
  +   '--gl-shadow:rgba(0,0,0,.55); --gl-ok:#3ECFC0; --gl-ng:#FFA45C;'
  + '}'

  /* 本文は指でなぞれるようにする（ボタンは除く） */
  + '#hkNote, #hkNote *, #hkAccordion, #hkAccordion *,'
  + '#hkQuiz, #hkQuiz *, #hkResult, #hkResult *,'
  + '#hkStats, #hkStats *, .hk-note-caution{'
  +   'user-select:text; -webkit-user-select:text;'
  + '}'
  + '#hkNote button, #hkQuiz button, #hkResult button, #hkStats button,'
  + '#hkNote .hk-back, #hkQuiz .hk-back, #hkResult .hk-back{'
  +   'user-select:none; -webkit-user-select:none;'
  + '}'

  /* なぞったときに出る小さなボタン */
  + '.hkg-chip{'
  +   'position:fixed; z-index:9998; display:none;'
  +   'padding:11px 16px; min-height:44px;'
  +   'border:0; border-radius:999px;'
  +   'background:linear-gradient(135deg,var(--gl-accent),var(--gl-accent2));'
  +   'color:#fff; font-family:"Noto Sans JP",sans-serif;'
  +   'font-size:.92rem; font-weight:800; letter-spacing:.02em;'
  +   'box-shadow:0 8px 24px var(--gl-shadow); cursor:pointer;'
  +   'white-space:nowrap; user-select:none; -webkit-user-select:none;'
  +   'touch-action:manipulation;'
  + '}'
  + '.hkg-chip:active{ transform:scale(.96); }'

  /* ふきだし本体（glossary.js が作る要素の見た目） */
  + '.gloss-overlay{'
  +   'display:none; position:fixed; inset:0; z-index:10000;'
  +   'background:rgba(0,0,0,.55);'
  +   'align-items:center; justify-content:center; padding:18px;'
  + '}'
  + '.gloss-box{'
  +   'width:100%; max-width:440px; max-height:80vh; overflow-y:auto;'
  +   'background:var(--gl-paper); color:var(--gl-ink);'
  +   'border:1.5px solid var(--gl-line); border-radius:20px;'
  +   'padding:20px 18px 16px; box-shadow:0 20px 60px var(--gl-shadow);'
  +   'font-family:"Noto Sans JP",sans-serif; line-height:1.85;'
  +   'user-select:text; -webkit-user-select:text;'
  + '}'
  + '.gloss-item{ padding:12px 0; border-bottom:1px solid var(--gl-line); }'
  + '.gloss-item:last-of-type{ border-bottom:none; }'
  + '.gloss-word{ font-size:1.15rem; font-weight:800; line-height:1.6;'
  +   'margin-bottom:6px; color:var(--gl-ink); }'
  + '.gloss-kana{ font-size:.85rem; font-weight:400; color:var(--gl-sub); opacity:1; }'
  + '.gloss-meaning{ font-size:1rem; line-height:1.9; color:var(--gl-ink); }'
  + '.gloss-note{'
  +   'font-size:.86rem; line-height:1.75; color:var(--gl-sub);'
  +   'background:var(--gl-soft); border-radius:12px;'
  +   'padding:10px 12px; margin:10px 0 4px;'
  + '}'
  + '.gloss-link{'
  +   'display:flex; align-items:center; justify-content:center;'
  +   'width:100%; margin-top:14px; padding:14px 16px; min-height:52px;'
  +   'border:0; border-radius:16px; text-align:center; text-decoration:none;'
  +   'background:linear-gradient(135deg,var(--gl-accent),var(--gl-accent2));'
  +   'color:#fff !important; font-family:"Noto Sans JP",sans-serif;'
  +   'font-size:1rem; font-weight:800; cursor:pointer;'
  +   'touch-action:manipulation;'
  + '}'
  + '.gloss-send{'
  +   'width:100%; margin-top:10px; padding:14px; min-height:52px;'
  +   'border:none; border-radius:16px;'
  +   'background:linear-gradient(135deg,var(--gl-accent),var(--gl-accent2));'
  +   'color:#fff; font-family:"Noto Sans JP",sans-serif;'
  +   'font-size:1rem; font-weight:800; cursor:pointer;'
  +   'touch-action:manipulation;'
  + '}'
  + '.gloss-link:active, .gloss-send:active{ transform:scale(.98); }'
  + '.gloss-send:disabled{ opacity:.5; cursor:default; }'
  + '.gloss-close{'
  +   'display:block; width:100%; margin-top:12px; padding:14px; min-height:50px;'
  +   'border:2px solid var(--gl-line); border-radius:16px;'
  +   'background:var(--gl-soft); color:var(--gl-ink);'
  +   'font-family:"Noto Sans JP",sans-serif;'
  +   'font-size:.95rem; font-weight:800; cursor:pointer;'
  +   'touch-action:manipulation;'
  + '}'
  + '.gloss-feedback{ font-size:.88rem; margin-top:8px; min-height:1.2em;'
  +   'font-weight:700; color:var(--gl-sub); }'
  + '.gloss-feedback.ok{ color:var(--gl-ok); }'
  + '.gloss-feedback.ng{ color:var(--gl-ng); }'
  + '.gloss-box ruby rt{ color:var(--gl-sub); opacity:1; }';

  function injectCSS() {
    if (document.getElementById('hkGlossStyle')) return;
    var s = document.createElement('style');
    s.id = 'hkGlossStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------
     2. ふりがな ON/OFF を glossary.js に伝える橋
        （過去問の storage.js はここでは読みこまないので、
          法改正ノートのスイッチの状態を代わりに返す）
     --------------------------------------------------------- */
  if (!window.KaigoStore) {
    window.KaigoStore = {
      getPref: function (key, def) {
        if (key !== 'furigana') return def;
        var el = document.getElementById('hkFuriganaSwitch');
        if (!el) return def;
        return el.getAttribute('aria-checked') === 'true';
      }
    };
  }

  /* ---------------------------------------------------------
     3. なぞった文字を整える
     --------------------------------------------------------- */
  function clean(s) {
    return String(s || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/（[ぁ-んー、・\s]+）/g, '')
      .replace(/\([ぁ-んー、・\s]+\)/g, '')
      .replace(/^[\s\u3000「」『』（）()【】〔〕・､、。,.：:；;!?！？…ー–—0-9①-⑳★☆※]+/, '')
      .replace(/[\s\u3000「」『』（）()【】〔〕・､、。,.：:；;!?！？…]+$/, '')
      .trim();
  }

  function pickSelection() {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

    var raw = clean(sel.toString());
    if (raw.length < MIN_LEN || raw.length > MAX_LEN) return null;

    // ふきだしの中の選択には反応しない
    var node = sel.anchorNode;
    var el = (node && node.nodeType === 1) ? node : (node && node.parentElement);
    if (el && el.closest && el.closest('.gloss-box')) return null;

    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;

    return { word: raw, rect: rect };
  }

  /* ---------------------------------------------------------
     4. 小さなボタン（チップ）
     --------------------------------------------------------- */
  var chip = null, current = '';

  function ensureChip() {
    if (chip) return chip;
    chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'hkg-chip';
    chip.textContent = '🔍 意味を見る';
    chip.addEventListener('mousedown', function (e) { e.preventDefault(); });
    chip.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      ask(current);
    });
    document.body.appendChild(chip);
    return chip;
  }

  function showChip(word, rect) {
    var c = ensureChip();
    current = word;
    c.style.display = 'inline-block';

    var w = c.offsetWidth || 150;
    var h = c.offsetHeight || 44;
    var left = rect.left + (rect.width / 2) - (w / 2);
    var top  = rect.top - h - 10;

    if (top < 8) top = rect.bottom + 10;   // 上が狭いときは下に出す
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;

    c.style.left = Math.round(left) + 'px';
    c.style.top  = Math.round(top) + 'px';
  }

  function hideChip() {
    if (chip) chip.style.display = 'none';
    current = '';
  }

  /* ---------------------------------------------------------
     5. 意味を出す（本体は ../exam/glossary.js）
     --------------------------------------------------------- */
  function contextLabel() {
    var quiz = document.getElementById('hkQuiz');
    var no   = document.getElementById('hkQuizNo');
    if (quiz && !quiz.classList.contains('hidden') && no && no.textContent) {
      return '法改正ノート ' + no.textContent.trim();
    }
    return '法改正ノート（本文）';
  }

  function ask(word) {
    if (!word) return;
    hideChip();
    try {
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    } catch (e) {}

    if (typeof window.KaigoAskWord === 'function') {
      window.KaigoAskWord(word, {
        label: contextLabel(),   // glossary.js を新版にすると、これがそのまま記録されます
        id:    contextLabel(),   // 旧版のままでも記録が空にならないための保険
        from:  'houkaisei'
      });
    } else {
      alert('用語集を読みこめませんでした。通信できる場所でもう一度お試しください。');
    }
  }

  /* ---------------------------------------------------------
     6. 出す・消すのきっかけ
     --------------------------------------------------------- */
  function onSelectEnd() {
    setTimeout(function () {
      var got = pickSelection();
      if (got) showChip(got.word, got.rect);
      else hideChip();
    }, 10);
  }

  function start() {
    injectCSS();
    document.addEventListener('mouseup', onSelectEnd);
    document.addEventListener('touchend', onSelectEnd);
    document.addEventListener('scroll', hideChip, true);
    window.addEventListener('resize', hideChip);
    document.addEventListener('mousedown', function (e) {
      if (chip && e.target !== chip) hideChip();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var btn = document.querySelector('.gloss-overlay .gloss-close');
      if (btn) btn.click();
      hideChip();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.HkGloss = { ask: ask, hide: hideChip };
})();
