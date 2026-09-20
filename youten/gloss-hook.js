/* =========================================================
   youten/gloss-hook.js
   要点集で「単語をなぞる → 意味 → フラッシュカード
   ／無い言葉はリクエスト送信」を過去問・法改正ノートと同じ形で動かす。
   ・意味の本体は ../exam/glossary.js（過去問と同じ用語集）
   ・見た目はこのファイルの中で用意（youten.css は触らない）

   ※ 元にしたのは houkaisei/gloss-hook.js です。
     変えたところは次の4つだけです。
       1. 戻り札の from を 'youten'、url を 'youten/index.html' に
       2. ラベルを「要点集 科目◯」に
       3. なぞれる場所の指定を #ytItems などに
       4. ふりがなスイッチの見に行き先を #ytFuriganaSwitch に
   Created by Mitsuhide Muneishi
   ========================================================= */
(function () {
  'use strict';

  var MIN_LEN = 2;    // これより短い選択は無視
  var MAX_LEN = 30;   // 長い文章の選択は無視（誤作動を防ぐ）

  /* ---------------------------------------------------------
     0. 戻り札（もどりふだ）
        フラッシュカードへ飛ぶ直前に「どこから来たか」を記録する。
        flashcard.html 側が、この記録を読んで戻るバーを出します。
        ※ 下の3つは法改正ノート・過去問と同じにしてあります。
           ・保存する名前  … kaigo_return_ticket_v1
           ・時刻の項目名  … d
           ・url の書き方  … ルートから見た場所を文字で書く
          ここを変えると、戻るバーが出なくなります。
     --------------------------------------------------------- */
  var TICKET_KEY = 'kaigo_return_ticket_v1';

  var lastWord = '';   // 直前に調べた言葉（戻るバーに表示されます）

  function subjectNo() {
    if (window.YtPage && typeof window.YtPage.subjectNo === 'function') {
      return window.YtPage.subjectNo();
    }
    var v = document.body.getAttribute('data-yt-subject');
    return v ? parseInt(v, 10) : 0;
  }

  function contextLabel() {
    var no = subjectNo();
    return no ? ('要点集 科目' + no) : '要点集（科目一覧）';
  }

  /* 戻ってきたとき、見ていた科目と位置を開き直すための覚え書き */
  function saveWhere() {
    try {
      if (!window.YtPage) return;
      var no = subjectNo();
      if (!no) return;
      localStorage.setItem(window.YtPage.backKey, JSON.stringify({
        subject: no,
        opened:  window.YtPage.openedIds ? window.YtPage.openedIds() : [],
        y:       window.scrollY || 0,
        d:       Date.now()
      }));
    } catch (e) {}
  }

  function saveReturnTicket(word) {
    try {
      var ticket = {
        from:  'youten',
        url:   'youten/index.html',      // フラッシュカード（ルート）から見た場所
        label: contextLabel(),           // 例: 要点集 科目1
        word:  (word !== undefined && word !== null) ? word : lastWord,
        d:     Date.now()
      };
      localStorage.setItem(TICKET_KEY, JSON.stringify(ticket));
    } catch (e) {}
    saveWhere();
  }

  /* ---------------------------------------------------------
     1. 見た目
        exam/style.css の .gloss-* と同じクラス名を使いつつ、
        色は --gl-* という独自の変数で持つので youten.css と
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
  + '#ytItems, #ytItems *, .yt-subject-head, .yt-subject-head *,'
  + '.yt-note-caution{'
  +   'user-select:text; -webkit-user-select:text;'
  + '}'
  + '#ytItems button, #ytItems .yt-back, .yt-fc-btn{'
  +   'user-select:none; -webkit-user-select:none;'
  + '}'

  /* なぞったときに出る小さなボタン */
  + '.ytg-chip{'
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
  + '.ytg-chip:active{ transform:scale(.96); }'

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
    if (document.getElementById('ytGlossStyle')) return;
    var s = document.createElement('style');
    s.id = 'ytGlossStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------
     2. ふりがな ON/OFF を glossary.js に伝える橋
        （過去問の storage.js はここでは読みこまないので、
          要点集のスイッチの状態を代わりに返す）
     --------------------------------------------------------- */
  if (!window.KaigoStore) {
    window.KaigoStore = {
      getPref: function (key, def) {
        if (key !== 'furigana') return def;
        var el = document.getElementById('ytFuriganaSwitch');
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
      .replace(/^[\s\u3000「」『』（）()【】〔〕〈〉・､、。,.：:；;!?！？…ー–—0-9①-⑳★☆※]+/, '')
      .replace(/[\s\u3000「」『』（）()【】〔〕〈〉・､、。,.：:；;!?！？…]+$/, '')
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
    chip.className = 'ytg-chip';
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

    /* 見やすいように少し大きめにする */
    c.style.fontSize = '1rem';
    c.style.padding  = '13px 20px';
    c.style.display  = 'inline-block';

    /* iPhoneは 100vh が実際に見えている高さより大きいので、
       vh ではなく window.innerHeight を使って計算する */
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var w = c.offsetWidth || 170;
    var left = (vw - w) / 2;
    if (left < 8) left = 8;
    if (left + w > vw - 8) left = vw - w - 8;
    c.style.left = Math.round(left) + 'px';

    /* iPhone標準の「コピー／調べる」とぶつからないよう、
       なぞった場所と反対側にこのボタンを置く */
    var selMiddle = (rect && rect.top != null) ? (rect.top + rect.bottom) / 2 : vh / 2;

    if (selMiddle > vh / 2) {
      c.style.top    = Math.round(vh * 0.20) + 'px';
      c.style.bottom = 'auto';
    } else {
      c.style.top    = 'auto';
      c.style.bottom = Math.round(vh * 0.26) + 'px';
    }
  }

  function hideChip() {
    if (chip) chip.style.display = 'none';
    current = '';
  }

  /* ---------------------------------------------------------
     5. 意味を出す（本体は ../exam/glossary.js）
     --------------------------------------------------------- */
  function ask(word) {
    if (!word) return;
    lastWord = word;        /* 戻るバーに「調べた言葉」を出すために覚えておく */
    hideChip();
    try {
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    } catch (e) {}

    if (typeof window.KaigoAskWord === 'function') {
      window.KaigoAskWord(word, {
        label: contextLabel(),   // これが出題元の列にそのまま入ります
        id:    contextLabel(),   // 旧版の glossary.js でも空にならないための保険
        from:  'youten'
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

    /* ふきだしの中の「フラッシュカードで見る」が押された瞬間に
       戻り札を残す。ページが切りかわる前に保存されます。 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('.gloss-link')) saveReturnTicket();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.YtGloss = { ask: ask, hide: hideChip, saveTicket: saveReturnTicket };
})();
