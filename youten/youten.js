/* ===================================================================
   各科目ごと要点集 - 動きの部分
   manabi-flashcard-kaigo- / youten/youten.js

   ※ 過去問(exam/app.js)・法改正ノート(houkaisei.js)とは独立しています。
   ※ 保存キーはすべて yt_ で始まるので、ほかの記録と混ざりません。
   ※ 読み込むデータ … data/youten-01.js … （window.YT_SUBJECTS に入る）
   ※ ふりがなは、データに一度書いた読みを辞書に覚えて
     画面ぜんたいの同じ言葉に自動で付けます（法改正ノートと同じ考え方）。
   Created by Mitsuhide Muneishi
   =================================================================== */
(function () {
  'use strict';

  /* =================================================================
     0. 保存キー
     ================================================================= */
  var V = '_v1';
  var K = {
    read: 'yt_read' + V,   // 開いた科目の番号
    furi: 'yt_furi' + V,   // ふりがな ON/OFF
    back: 'yt_back' + V    // フラッシュカードから戻ってきたときの合図
  };

  var SUBJECTS = (window.YT_SUBJECTS || []).slice().sort(function (a, b) {
    return (a.no || 0) - (b.no || 0);
  });

  /* =================================================================
     1. 小さな道具
     ================================================================= */
  function $(id) { return document.getElementById(id); }

  function load(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function starMark(n) {
    if (n >= 3) return '★★★';
    if (n === 2) return '★★';
    return '★';
  }

  /* =================================================================
     2. ふりがな
        データ側は「介護（かいご）」の形で書きます。
        カッコの読みは辞書を作るためだけに使い、
        画面に出す文字からは ON でも OFF でもカッコを消します。
     ================================================================= */

  /* 学習用：漢字（かな） */
  var RE_RUBY = /([\u4E00-\u9FFF\u3005\u3006\u3007]+)（([\u3041-\u309F\u30FC\u3000\s・･]+)）/g;

  /* 表示用：数字やカタカナがまざっていてもカッコを消せる形 */
  var RE_RUBY_ANY = /([\u4E00-\u9FFF\u3005\u3006\u3007\u30A1-\u30FA\u30FC0-9０-９]+)（([\u3041-\u309F\u30FC\u3000\s・･]+)）/g;

  var RE_KANJI = /[\u4E00-\u9FFF\u3005\u3006\u3007]+/g;

  /* 画面のボタンや見出しなど、データに読みを書いていない言葉。
     読みがまちがっていたときも、ここに足せば最優先で直ります。
     （数字のうしろの漢字は辞書に覚えないので、ここに書きます） */
  var YT_FIX = {
    '要点集':'ようてんしゅう', '各科目':'かくかもく', '科目':'かもく',
    '介護福祉士':'かいごふくしし', '国家試験':'こっかしけん', '対策':'たいさく',
    '介護':'かいご', '福祉':'ふくし', '試験':'しけん',
    '第':'だい', '条':'じょう', '章':'しょう', '回':'かい', '問':'もん',
    '週間':'しゅうかん', '年':'ねん', '問題':'もんだい',
    '文字':'もじ', '標準':'ひょうじゅん', '大':'だい', '特大':'とくだい',
    '表示':'ひょうじ', '設定':'せってい', '戻':'もど', '開':'ひら',
    '読':'よ', '見':'み', '出題':'しゅつだい', '傾向':'けいこう',
    '全':'ぜん', '点':'てん', '言葉':'ことば', '意味':'いみ', '調':'しら',
    '指':'ゆび', '確認':'かくにん', '整理':'せいり', '学習用':'がくしゅうよう',
    '本文':'ほんぶん', '用語':'ようご', '収録':'しゅうろく',
    '気':'き', '大丈夫':'だいじょうぶ', '一覧':'いちらん',
    '一般社団法人':'いっぱんしゃだんほうじん', '協会':'きょうかい',
    '宗石':'むねいし', '光英':'みつひで'
  };

  var FG_DICT = {};   // 漢字 → よみ
  var FG_MAX  = 1;    // 辞書のいちばん長いキーの文字数

  var furiOn = (load(K.furi, 'off') === 'on');

  function fgKana(s) {
    return String(s).replace(/[\s\u3000・･]/g, '');
  }

  /* データの中から「漢字（かな）」を拾って辞書に覚える */
  function fgLearn(text) {
    if (!text) return;
    String(text).replace(RE_RUBY, function (m, kanji, kana, off, whole) {
      /* 「第13条（じょう）」のように数字のうしろだと読みがずれることが
         あるので、そういう形は覚えません（必要なら YT_FIX に書きます）*/
      var prev = (off > 0) ? String(whole).charAt(off - 1) : '';
      if (/[0-9０-９]/.test(prev)) return m;
      var k = fgKana(kana);
      if (k && !FG_DICT[kanji]) FG_DICT[kanji] = k;
      return m;
    });
  }
  function fgScan(v, depth) {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') { fgLearn(v); return; }
    if (typeof v === 'object' && (depth || 0) < 8) {
      for (var k in v) { if (v.hasOwnProperty(k)) fgScan(v[k], (depth || 0) + 1); }
    }
  }
  function fgBuildDict() {
    FG_DICT = {};
    fgScan(SUBJECTS, 0);
    for (var k in YT_FIX) { if (YT_FIX.hasOwnProperty(k)) FG_DICT[k] = YT_FIX[k]; }
    FG_MAX = 1;
    for (var k2 in FG_DICT) {
      if (FG_DICT.hasOwnProperty(k2) && k2.length > FG_MAX) FG_MAX = k2.length;
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 読みのカッコを消す（ON/OFF どちらでも消します） */
  function stripRuby(text) {
    if (text === undefined || text === null) return '';
    return String(text).replace(RE_RUBY_ANY, '$1');
  }

  /* 漢字のかたまりに、長い言葉から順に読みをあてはめる */
  function fgRubyRun(run) {
    var out = '', i = 0;
    while (i < run.length) {
      var hit = null;
      var max = Math.min(FG_MAX, run.length - i);
      for (var L = max; L >= 1; L--) {
        var sub = run.substr(i, L);
        if (FG_DICT[sub]) { hit = sub; break; }
      }
      if (hit) {
        out += '<ruby>' + esc(hit) + '<rt>' + esc(FG_DICT[hit]) + '</rt></ruby>';
        i += hit.length;
      } else {
        out += esc(run.charAt(i));
        i += 1;
      }
    }
    return out;
  }

  function fgTextHtml(t) {
    var out = '', last = 0, m;
    RE_KANJI.lastIndex = 0;
    while ((m = RE_KANJI.exec(t)) !== null) {
      out += esc(t.slice(last, m.index));
      out += fgRubyRun(m[0]);
      last = m.index + m[0].length;
    }
    out += esc(t.slice(last));
    return out;
  }

  /* データの文字列を画面用のHTMLに変える。
     <strong> や <br> はそのまま残し、文字の部分だけにふりがなを付けます。 */
  function deco(text) {
    var s = stripRuby(text);
    var parts = s.split(/(<[^>]+>)/);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      if (p.charAt(0) === '<' && p.charAt(p.length - 1) === '>') { out += p; }
      else { out += furiOn ? fgTextHtml(p) : esc(p); }
    }
    return out;
  }

  /* =================================================================
     3. ブロック（5種類）を描く
        text / list / table / judge / key
     ================================================================= */
  function renderBlock(b) {
    if (!b || !b.type) return '';
    var cap = b.cap ? '<div class="yt-block-cap">' + deco(b.cap) + '</div>' : '';
    var h = '';
    var i, j;

    if (b.type === 'text') {
      h = '<p class="yt-text">' + deco(b.body) + '</p>';

    } else if (b.type === 'list') {
      h = '<ul class="yt-list">';
      for (i = 0; i < (b.items || []).length; i++) {
        h += '<li>' + deco(b.items[i]) + '</li>';
      }
      h += '</ul>';

    } else if (b.type === 'table') {
      h = '<div class="yt-table-wrap"><table class="yt-table">';
      if (b.head && b.head.length) {
        h += '<thead><tr>';
        for (i = 0; i < b.head.length; i++) {
          h += '<th>' + deco(b.head[i]) + '</th>';
        }
        h += '</tr></thead>';
      }
      h += '<tbody>';
      for (i = 0; i < (b.rows || []).length; i++) {
        h += '<tr>';
        for (j = 0; j < b.rows[i].length; j++) {
          h += '<td' + (j === 0 ? ' class="yt-td-head"' : '') + '>' + deco(b.rows[i][j]) + '</td>';
        }
        h += '</tr>';
      }
      h += '</tbody></table></div>';

    } else if (b.type === 'judge') {
      h = '<div class="yt-judge">';
      if (b.ok && b.ok.length) {
        h += '<div class="yt-judge-col yt-judge-ok"><div class="yt-judge-cap">○ こう考える</div><ul>';
        for (i = 0; i < b.ok.length; i++) { h += '<li>' + deco(b.ok[i]) + '</li>'; }
        h += '</ul></div>';
      }
      if (b.ng && b.ng.length) {
        h += '<div class="yt-judge-col yt-judge-ng"><div class="yt-judge-cap">× これは誤り</div><ul>';
        for (i = 0; i < b.ng.length; i++) { h += '<li>' + deco(b.ng[i]) + '</li>'; }
        h += '</ul></div>';
      }
      h += '</div>';

    } else if (b.type === 'key') {
      h = '<div class="yt-key">' + deco(b.body) + '</div>';
    }

    return '<div class="yt-block">' + cap + h + '</div>';
  }

  /* =================================================================
     4. 画面を出し分ける
     ================================================================= */
  var nowSubject = null;   // いま開いている科目（データそのもの）

  function show(id) {
    var ids = ['ytMenu', 'ytSubject'];
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (!el) continue;
      if (ids[i] === id) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  }

  function readList() { return load(K.read, []); }

  function markRead(no) {
    var list = readList();
    if (list.indexOf(no) === -1) { list.push(no); save(K.read, list); }
  }

  /* ---- 画面1：科目えらび ---- */
  function renderMenu() {
    var box = $('ytSubjectList');
    if (!box) return;

    var read = readList();
    var html = '';
    var lastPart = null;
    var items = 0;

    for (var i = 0; i < SUBJECTS.length; i++) {
      var s = SUBJECTS[i];
      items += (s.items || []).length;

      if (s.partTitle && s.partTitle !== lastPart) {
        html += '<div class="yt-section-title">' +
                (s.part ? 'パート' + esc(s.part) + '　' : '') +
                deco(s.partTitle) + '</div><ul class="yt-menu-list">';
        lastPart = s.partTitle;
      } else if (i === 0) {
        html += '<ul class="yt-menu-list">';
      }

      html += '<li>' +
        '<button type="button" class="yt-menu-item" data-yt-open="' + s.no + '">' +
          '<span class="yt-menu-no">科目' + s.no + '</span>' +
          '<span class="yt-menu-title">' + deco(s.title) + '</span>' +
          (s.lead ? '<span class="yt-menu-sub">' + deco(s.lead) + '</span>' : '') +
          (read.indexOf(s.no) !== -1 ? '<span class="yt-menu-read">読んだ</span>' : '') +
        '</button></li>';

      var next = SUBJECTS[i + 1];
      if (!next || (next.partTitle && next.partTitle !== lastPart)) html += '</ul>';
    }

    if (!SUBJECTS.length) {
      html = '<div class="yt-empty">まだ科目データが入っていません。</div>';
    }
    box.innerHTML = html;

    var total = SUBJECTS.length;
    var done = 0;
    for (var j = 0; j < read.length; j++) {
      for (var k = 0; k < SUBJECTS.length; k++) {
        if (SUBJECTS[k].no === read[j]) { done++; break; }
      }
    }
    if ($('ytDashRead'))  $('ytDashRead').firstChild.nodeValue = String(done);
    if ($('ytDashTotal')) $('ytDashTotal').textContent = '/' + total;
    if ($('ytDashItems')) $('ytDashItems').textContent = String(items);
    if ($('ytDashFill'))  $('ytDashFill').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  }

  /* ---- 画面2：科目の中身 ---- */
  function renderSubject(s, keepOpen) {
    nowSubject = s;
    document.body.setAttribute('data-yt-subject', String(s.no));

    if ($('ytSubjectPart'))  $('ytSubjectPart').innerHTML  =
      (s.part ? 'パート' + esc(s.part) + '　' : '') + deco(s.partTitle || '');
    if ($('ytSubjectNo'))    $('ytSubjectNo').textContent  = '科目' + s.no;
    if ($('ytSubjectTitle')) $('ytSubjectTitle').innerHTML = deco(s.title);
    if ($('ytSubjectLead'))  $('ytSubjectLead').innerHTML  = deco(s.lead || '');
    if ($('ytSubjectIntro')) $('ytSubjectIntro').innerHTML = deco(s.intro || '');

    var box = $('ytItems');
    if (!box) return;

    var html = '';
    for (var i = 0; i < (s.items || []).length; i++) {
      var it = s.items[i];
      var open = keepOpen ? (keepOpen.indexOf(it.id) !== -1) : false;

      html += '<section class="yt-item' + (open ? ' yt-open' : '') + '" data-yt-item="' + esc(it.id) + '">' +
        '<button type="button" class="yt-item-head" data-yt-toggle="' + esc(it.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="yt-item-id">' + esc(it.id) + '</span>' +
          '<span class="yt-item-title">' + deco(it.title) + '</span>' +
          '<span class="yt-item-star">' + starMark(it.star || 1) + '</span>' +
          '<span class="yt-item-arrow" aria-hidden="true">▼</span>' +
        '</button>' +
        '<div class="yt-item-body">';

      if (it.hitokoto) html += '<div class="yt-hitokoto">' + deco(it.hitokoto) + '</div>';
      for (var b = 0; b < (it.blocks || []).length; b++) {
        html += renderBlock(it.blocks[b]);
      }
      if (it.point) html += '<div class="yt-point"><span class="yt-point-cap">ここが出る</span>' + deco(it.point) + '</div>';

      html += '</div></section>';
    }
    box.innerHTML = html;
  }

  function openSubject(no, keepOpen, y) {
    var s = null;
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (SUBJECTS[i].no === no) { s = SUBJECTS[i]; break; }
    }
    if (!s) return;
    renderSubject(s, keepOpen);
    markRead(no);
    show('ytSubject');
    if (typeof y === 'number') {
      setTimeout(function () { window.scrollTo(0, y); }, 60);
    } else {
      window.scrollTo(0, 0);
    }
  }

  function backToMenu() {
    nowSubject = null;
    document.body.removeAttribute('data-yt-subject');
    renderMenu();
    show('ytMenu');
    window.scrollTo(0, 0);
  }

  /* いま開いている見出しの番号を集める（ふりがな切り替えで閉じないように） */
  function openedIds() {
    var out = [];
    var els = document.querySelectorAll('#ytItems .yt-item.yt-open');
    for (var i = 0; i < els.length; i++) {
      out.push(els[i].getAttribute('data-yt-item'));
    }
    return out;
  }

  /* =================================================================
     5. ふりがなスイッチ
     ================================================================= */
  function paintFurigana() {
    var sw = $('ytFuriganaSwitch');
    var tr = $('ytFuriganaTrack');
    var st = $('ytFuriganaStatus');
    if (sw) sw.setAttribute('aria-checked', furiOn ? 'true' : 'false');
    if (tr) { if (furiOn) tr.classList.add('on'); else tr.classList.remove('on'); }
    if (st) st.textContent = furiOn ? 'ON' : 'OFF';
  }

  function redraw() {
    if (nowSubject) renderSubject(nowSubject, openedIds());
    else renderMenu();
  }

  function toggleFurigana() {
    furiOn = !furiOn;
    save(K.furi, furiOn ? 'on' : 'off');
    paintFurigana();
    var y = window.scrollY;
    redraw();
    setTimeout(function () { window.scrollTo(0, y); }, 0);
  }

  /* =================================================================
     6. きっかけ（クリックなど）
     ================================================================= */
  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var open = t.closest('[data-yt-open]');
      if (open) { openSubject(parseInt(open.getAttribute('data-yt-open'), 10)); return; }

      var tog = t.closest('[data-yt-toggle]');
      if (tog) {
        var sec = tog.parentNode;
        var on = sec.classList.toggle('yt-open');
        tog.setAttribute('aria-expanded', on ? 'true' : 'false');
        return;
      }

      var act = t.closest('[data-yt-action]');
      if (act && act.getAttribute('data-yt-action') === 'backToMenu') { backToMenu(); return; }
    });

    var sw = $('ytFuriganaSwitch');
    if (sw) {
      sw.addEventListener('click', toggleFurigana);
      sw.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFurigana(); }
      });
    }

    var fc = $('ytToFlashcard');
    if (fc) {
      fc.addEventListener('click', function () {
        /* 戻り札は gloss-hook.js が用意します（無くても飛べます） */
        if (window.YtGloss && typeof window.YtGloss.saveTicket === 'function') {
          window.YtGloss.saveTicket('');
        }
        location.href = '../flashcard.html';
      });
    }
  }

  /* =================================================================
     7. はじめの1回
     ================================================================= */
  function init() {
    fgBuildDict();
    paintFurigana();
    bind();

    /* フラッシュカードから戻ってきたときは、見ていたところを開き直す */
    var back = load(K.back, null);
    remove(K.back);
    if (back && back.subject && (Date.now() - (back.d || 0) < 3 * 60 * 60 * 1000)) {
      renderMenu();
      openSubject(back.subject, back.opened || [], back.y || 0);
      return;
    }

    renderMenu();
    show('ytMenu');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* gloss-hook.js から使う入口 */
  window.YtPage = {
    subjectNo: function () { return nowSubject ? nowSubject.no : 0; },
    openedIds: openedIds,
    backKey:  K.back
  };
})();
