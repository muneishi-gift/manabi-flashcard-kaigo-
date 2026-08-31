/* ===================================================================
   法改正まるわかりノート - 動きの部分
   manabi-flashcard-kaigo- / houkaisei/houkaisei.js
   ※ 過去問アプリ(exam/app.js)とは完全に独立しています。
   ※ 保存キーはすべて hk_ で始まり、過去問の記録とは混ざりません。
   ※ 読み込むデータ … data/note.js (window.HK_NOTE)
                       data/quiz.js (window.HK_QUIZ)
   ※ 選択肢シャッフル機能つき（ON/OFF切り替え・既定ON）
   Created by Mitsuhide Muneishi
   =================================================================== */
(function () {
  'use strict';

  /* =================================================================
     0. 保存キー（過去問アプリとぶつからないよう hk_ を付けています）
     ================================================================= */
  var V = '_v1';
  var K = {
    read:    'hk_read'    + V,   // 読み終わった章
    stats:   'hk_stats'   + V,   // 問題ごとの成績
    resume:  'hk_resume'  + V,   // 途中でやめたときの続き
    furi:    'hk_furi'    + V,   // ふりがな ON/OFF
    days:    'hk_days'    + V,   // 連続学習日数
    shuffle: 'hk_shuffle' + V    // 選択肢シャッフル ON/OFF
  };

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

  function todayKey() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  function fmtTime(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (m > 0) return m + '分' + (r < 10 ? '0' : '') + r + '秒';
    return r + '秒';
  }

  function starMark(n) {
    if (n >= 3) return '★★★';
    if (n === 2) return '★★';
    return '★';
  }

  /* =================================================================
     2. ふりがな
     データ側は「介護（かいご）」の形で書きます。
       ON  … <ruby>介護<rt>かいご</rt></ruby>
       OFF … 介護（カッコごと消す）
     ================================================================= */
  var RE_RUBY = /([\u4E00-\u9FFF\u3005\u3006\u3007]+)（([\u3041-\u309F\u30FC]+)）/g;

  var furiOn = (load(K.furi, 'off') === 'on');

  function fg(text) {
    if (text === undefined || text === null) return '';
    var s = String(text);
    return furiOn
      ? s.replace(RE_RUBY, '<ruby>$1<rt>$2</rt></ruby>')
      : s.replace(RE_RUBY, '$1');
  }

  // ふりがなカッコを取りのぞいた、ただの文字列にする（判定用）
  function plain(text) {
    if (text === undefined || text === null) return '';
    return String(text).replace(RE_RUBY, '$1');
  }

  function paintFurigana() {
    var sw = $('hkFuriganaSwitch');
    var st = $('hkFuriganaStatus');
    if (!sw || !st) return;
    if (furiOn) { sw.classList.add('on'); } else { sw.classList.remove('on'); }
    sw.setAttribute('aria-checked', furiOn ? 'true' : 'false');
    st.textContent = furiOn ? 'ON' : 'OFF';
  }

  function toggleFurigana() {
    furiOn = !furiOn;
    save(K.furi, furiOn ? 'on' : 'off');
    paintFurigana();
    renderCurrent();   // 今出ている画面を作り直す
  }

  /* =================================================================
     3. データの読み込みチェック
     ================================================================= */
  var NOTE = (window.HK_NOTE && window.HK_NOTE.chapters) ? window.HK_NOTE.chapters : [];
  var QUIZ = window.HK_QUIZ ? window.HK_QUIZ : [];

  var TOTAL_CHAP = NOTE.length;
  var TOTAL_Q    = QUIZ.length;

  // 問題を id で引けるようにしておく
  var QMAP = {};
  var i;
  for (i = 0; i < QUIZ.length; i++) { QMAP[QUIZ[i].id] = QUIZ[i]; }

  // 章ごとの問題id一覧
  function idsOfChapter(no) {
    var out = [];
    for (var j = 0; j < QUIZ.length; j++) {
      if (QUIZ[j].chapter === no) out.push(QUIZ[j].id);
    }
    return out;
  }
  function allIds() {
    var out = [];
    for (var j = 0; j < QUIZ.length; j++) out.push(QUIZ[j].id);
    return out;
  }

  /* =================================================================
     3-B. 選択肢シャッフル
     ・既定はON。localStorage に覚えます。
     ・「上記すべて」など、順番が変わると意味がこわれる選択肢を
       ふくむ問題は、自動でシャッフルを止めます。
     ・data/quiz.js に noShuffle: true と書いた問題も止まります。
     ================================================================= */
  var shuffleOn = (load(K.shuffle, 'on') === 'on');

  // 順番が変わるとおかしくなる言い方
　var RE_FIXED = /(上記|前記|以上のすべて|すべて正しい|すべて誤り|すべてまちがい|いずれも|両方|正しいものはない|誤っているものはない|１と２|1と2|２と３|2と3|①|②|③|④)/;

  function isFixedOrder(q) {
    if (!q || !q.choices) return true;
    if (q.noShuffle) return true;
    for (var j = 0; j < q.choices.length; j++) {
      if (RE_FIXED.test(plain(q.choices[j]))) return true;
    }
    return false;
  }

  // 0,1,2,... の並び
  function seqIdx(n) {
    var a = [];
    for (var j = 0; j < n; j++) a.push(j);
    return a;
  }
  // かきまぜた並び（フィッシャー・イェーツ）
  function shuffledIdx(n) {
    var a = seqIdx(n);
    for (var j = a.length - 1; j > 0; j--) {
      var r = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[r]; a[r] = t;
    }
    return a;
  }

  function paintShuffle() {
    var btn = $('hkShuffleBtn');
    if (!btn) return;
    if (shuffleOn) { btn.classList.add('hk-on'); } else { btn.classList.remove('hk-on'); }
    btn.setAttribute('aria-pressed', shuffleOn ? 'true' : 'false');
    btn.textContent = shuffleOn ? '🔀 選択肢シャッフル ON' : '🔀 選択肢シャッフル OFF';
  }

  function toggleShuffle() {
    shuffleOn = !shuffleOn;
    save(K.shuffle, shuffleOn ? 'on' : 'off');
    paintShuffle();
    // まだ答えていない問題なら、その場で並べかえ直す
    if (current === 'hkQuiz' && S.picked === null) {
      S.orderFor = null;
      renderQuestion();
    }
  }

  // 出題画面に切り替えボタンを差し込む（index.html は変えません）
  function mountShuffleToggle() {
    if ($('hkShuffleBtn')) { paintShuffle(); return; }
    var qEl = $('hkQuizQuestion');
    if (!qEl || !qEl.parentNode) return;

    var wrap = document.createElement('div');
    wrap.className = 'hk-note-tools';
    wrap.style.marginBottom = '10px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'hkShuffleBtn';
    btn.className = 'hk-tool-btn';
    btn.setAttribute('data-hk-action', 'toggleShuffle');
    btn.setAttribute('aria-pressed', 'false');

    wrap.appendChild(btn);
    qEl.parentNode.insertBefore(wrap, qEl);
    paintShuffle();
  }

  /* =================================================================
     4. 記録
     stats = { q: { "1-1": {n:回数, ok:正解数, lastOk:true/false, conf:"sure"} },
               sessions: [ {date, mode, score, total, ms} ] }
     ================================================================= */
  var readMap = load(K.read, {});                       // {"1":true, ...}
  var stats   = load(K.stats, { q: {}, sessions: [] });
  if (!stats.q) stats.q = {};
  if (!stats.sessions) stats.sessions = [];

  function qrec(id) {
    if (!stats.q[id]) stats.q[id] = { n: 0, ok: 0, lastOk: null, conf: null, lastMs: 0 };
    return stats.q[id];
  }

  function solvedCount() {
    var c = 0;
    for (var id in stats.q) {
      if (stats.q.hasOwnProperty(id) && QMAP[id] && stats.q[id].n > 0) c++;
    }
    return c;
  }
  function readCount() {
    var c = 0;
    for (var k in readMap) { if (readMap.hasOwnProperty(k) && readMap[k]) c++; }
    return c;
  }
  function overallRate() {
    var n = 0, ok = 0;
    for (var id in stats.q) {
      if (stats.q.hasOwnProperty(id) && QMAP[id]) {
        n += stats.q[id].n;
        ok += stats.q[id].ok;
      }
    }
    if (n === 0) return null;
    return Math.round(ok / n * 100);
  }
  function chapterRate(no) {
    var ids = idsOfChapter(no), n = 0, ok = 0;
    for (var j = 0; j < ids.length; j++) {
      var r = stats.q[ids[j]];
      if (r) { n += r.n; ok += r.ok; }
    }
    if (n === 0) return null;
    return Math.round(ok / n * 100);
  }

  // 復習リスト（まちがえた／手ごたえが「たぶん・勘」だった問題）
  function reviewIds() {
    var out = [];
    for (var j = 0; j < QUIZ.length; j++) {
      var r = stats.q[QUIZ[j].id];
      if (!r || r.n === 0) continue;
      if (r.lastOk === false || r.conf === 'maybe' || r.conf === 'guess') out.push(QUIZ[j].id);
    }
    return out;
  }
  // 危険ゾーン（「自信あり」なのにまちがえた問題）
  function dangerIds() {
    var out = [];
    for (var j = 0; j < QUIZ.length; j++) {
      var r = stats.q[QUIZ[j].id];
      if (r && r.lastOk === false && r.conf === 'sure') out.push(QUIZ[j].id);
    }
    return out;
  }

  // 連続学習日数
  function touchDays() {
    var d = load(K.days, { last: null, streak: 0 });
    var t = todayKey();
    if (d.last === t) return d;
    var y = new Date(); y.setDate(y.getDate() - 1);
    function z(n) { return (n < 10 ? '0' : '') + n; }
    var yk = y.getFullYear() + '-' + z(y.getMonth() + 1) + '-' + z(y.getDate());
    d.streak = (d.last === yk) ? (d.streak + 1) : 1;
    d.last = t;
    save(K.days, d);
    return d;
  }

  /* =================================================================
     5. 画面の切り替え
     ================================================================= */
  var SCREENS = ['hkMenu', 'hkNote', 'hkChapterSelect', 'hkQuiz', 'hkResult', 'hkSummary', 'hkStats'];
  var current = 'hkMenu';

  function show(id) {
    for (var j = 0; j < SCREENS.length; j++) {
      var el = $(SCREENS[j]);
      if (!el) continue;
      if (SCREENS[j] === id) { el.classList.remove('hidden'); }
      else { el.classList.add('hidden'); }
    }
    current = id;
    window.scrollTo(0, 0);
  }

  // ふりがな切り替え時に、今の画面だけ作り直す
  function renderCurrent() {
    if (current === 'hkMenu')          { renderMenu(); }
    else if (current === 'hkNote')     { renderNote(); }
    else if (current === 'hkChapterSelect') { renderChapterSelect(); }
    else if (current === 'hkQuiz')     { renderQuestion(); }
    else if (current === 'hkResult')   { renderResult(); }
    else if (current === 'hkStats')    { renderStats(); }
  }

  /* =================================================================
     6. メニュー画面
     ================================================================= */
  function renderMenu() {
    var read = readCount();
    var solved = solvedCount();
    var rate = overallRate();

    if ($('hkDashRead'))   $('hkDashRead').innerHTML   = read + '<span>/' + TOTAL_CHAP + '</span>';
    if ($('hkDashSolved')) $('hkDashSolved').innerHTML = solved + '<span>/' + TOTAL_Q + '</span>';
    if ($('hkDashRate'))   $('hkDashRate').innerHTML   = (rate === null ? '–' : rate) + '<span>%</span>';

    // 進み具合 … 読んだ章と解いた問題を半分ずつで計算
    var prog = 0;
    if (TOTAL_CHAP > 0) prog += (read / TOTAL_CHAP) * 50;
    if (TOTAL_Q > 0)    prog += (solved / TOTAL_Q) * 50;
    if ($('hkDashFill')) $('hkDashFill').style.width = Math.round(prog) + '%';

    // はげましのことば
    var days = load(K.days, { streak: 0 });
    var msg;
    if (read === 0 && solved === 0) {
      msg = 'まずはノートを1章だけ読んでみましょう。<br>5分あれば読めます。';
    } else if (solved === 0) {
      msg = read + '章読みました。<br>読んだ章だけ、問題を解いてみましょう。';
    } else if (rate !== null && rate >= 80) {
      msg = 'いいペースです。正解率' + rate + '％。<br>あとは「いつから」を言えるかだけ確認しましょう。';
    } else if (rate !== null && rate >= 60) {
      msg = 'あと少しです。正解率' + rate + '％。<br>まちがえた章をもう一度読むと一気に伸びます。';
    } else {
      msg = '正解率' + rate + '％。今はこれでだいじょうぶ。<br>まちがえた問題こそ、本番で点になります。';
    }
    if (days.streak >= 2) {
      msg += '<br>🔥 ' + days.streak + '日連続で学習中です。';
    }
    if ($('hkDashMsg')) $('hkDashMsg').innerHTML = msg;

    // 続きから再開
    var res = load(K.resume, null);
    var rb = $('hkResumeBtn');
    if (rb) {
      if (res && res.queue && res.queue.length && res.idx < res.queue.length) {
        rb.hidden = false;
        if ($('hkResumeSub')) {
          $('hkResumeSub').textContent =
            modeLabel(res.mode) + '　' + (res.idx + 1) + '問目から（全' + res.queue.length + '問）';
        }
      } else {
        rb.hidden = true;
      }
    }

    // 復習・危険ゾーン
    var rv = reviewIds(), dg = dangerIds();
    var rvBtn = $('hkReviewBtn'), dgBtn = $('hkDangerBtn');
    if (rvBtn) {
      if (rv.length) {
        rvBtn.classList.remove('hk-disabled');
        $('hkReviewSub').textContent = 'いま ' + rv.length + '問たまっています';
      } else {
        rvBtn.classList.add('hk-disabled');
        $('hkReviewSub').textContent = 'まちがえた問題がたまるとここに出ます';
      }
    }
    if (dgBtn) {
      if (dg.length) {
        dgBtn.classList.remove('hk-disabled');
        $('hkDangerSub').textContent =
          '⚠️ ' + dg.length + '問。「自信あり」なのにまちがえた問題です';
      } else {
        dgBtn.classList.add('hk-disabled');
        $('hkDangerSub').textContent = '今はありません。この状態がベストです';
      }
    }
  }

  function modeLabel(m) {
    if (m === 'all') return '全問';
    if (m === 'review') return '復習';
    if (m === 'danger') return '危険ゾーン';
    if (m === 'wrong') return 'まちがえた問題';
    if (m && m.indexOf('chap') === 0) return '第' + m.replace('chap', '') + '章';
    return '予想問題';
  }

  /* =================================================================
     7. ノート画面（開閉式）
     ================================================================= */
  var openSet = {};      // 開いている章
  var star3Only = false; // ★★★だけ表示

  function renderNote() {
    var box = $('hkAccordion');
    if (!box) return;

    if (!NOTE.length) {
      box.innerHTML = '<div class="hk-note-caution">ノートのデータ（data/note.js）が読みこめていません。</div>';
      return;
    }

    var html = '';
    for (var c = 0; c < NOTE.length; c++) {
      var ch = NOTE[c];
      var no = ch.no;
      var isOpen = !!openSet[no];
      var isRead = !!readMap[no];
      var qn = idsOfChapter(no).length;

      html += '<div class="hk-chap' + (isOpen ? ' hk-open' : '') + '" data-chap="' + no + '">';
      html +=   '<button type="button" class="hk-chap-head" data-hk-action="toggleChap" data-chap="' + no + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">';
      html +=     '<span class="hk-chap-num">' + no + '</span>';
      html +=     '<span class="hk-chap-title">' + fg(ch.title);
      html +=       '<span class="hk-chap-meta">' + (qn ? ('予想問題 ' + qn + '問') : '読むだけの章');
      if (ch.lead) html += '　/　' + fg(ch.lead);
      html +=       '</span>';
      html +=     '</span>';
      if (isRead) html += '<span class="hk-chap-badge">読んだ</span>';
      html +=     '<span class="hk-chap-arrow">▼</span>';
      html +=   '</button>';

      if (isOpen) {
        html += '<div class="hk-chap-body">';
        for (var t = 0; t < ch.items.length; t++) {
          html += itemHtml(ch.items[t]);
        }
        html += '<button type="button" class="hk-chap-done' + (isRead ? ' hk-done' : '') + '" ' +
                'data-hk-action="markRead" data-chap="' + no + '">' +
                (isRead ? '✓ この章は読みました（もう一度押すと取り消し）' : 'この章を読み終わった') +
                '</button>';
        html += '</div>';
      }
      html += '</div>';
    }
    box.innerHTML = html;

    applyStar3Filter();

    // 下のメッセージ
    var left = TOTAL_CHAP - readCount();
    if ($('hkNoteFootMsg')) {
      $('hkNoteFootMsg').innerHTML = (left === 0)
        ? '全部読み終わりました。あとは解いて確かめるだけです。'
        : '読み終わったら、覚えたか確かめてみましょう。<br>（のこり ' + left + '章）';
    }
  }

  function itemHtml(it) {
    var s = it.star || 1;
    var cls = (s === 3) ? '' : (s === 2 ? ' hk-s2' : ' hk-s1');
    var h = '<div class="hk-item" id="hkItem_' + it.id + '" data-star="' + s + '">';
    h += '<div class="hk-item-head">';
    h +=   '<span class="hk-item-title">' + it.id + '　' + fg(it.title) + '</span>';
    h +=   '<span class="hk-item-star' + cls + '">' + starMark(s) + '</span>';
    h += '</div>';
    if (it.hitokoto) h += '<div class="hk-hitokoto">' + fg(it.hitokoto) + '</div>';
    if (it.who)  h += kv('だれが', it.who);
    if (it.duty) h += kv('義務？', it.duty);
    if (it.when) h += kv('いつから', it.when);
    if (it.extra) h += kv('ひとこと', it.extra);
    if (it.point) h += '<div class="hk-point">' + fg(it.point) + '</div>';
    h += '</div>';
    return h;
  }
  function kv(key, val) {
    return '<div class="hk-kv"><span class="hk-kv-key">' + key + '</span>' +
           '<span class="hk-kv-val">' + fg(val) + '</span></div>';
  }

  function applyStar3Filter() {
    var btn = document.querySelector('[data-hk-action="onlyStar3"]');
    if (btn) {
      if (star3Only) { btn.classList.add('hk-on'); } else { btn.classList.remove('hk-on'); }
    }
    var items = document.querySelectorAll('#hkAccordion .hk-item');
    for (var j = 0; j < items.length; j++) {
      var s = parseInt(items[j].getAttribute('data-star'), 10);
      items[j].style.display = (star3Only && s < 3) ? 'none' : '';
    }
  }

  function toggleChap(no) {
    if (openSet[no]) { delete openSet[no]; } else { openSet[no] = true; }
    renderNote();
    // 開いた章が画面から消えないように位置を合わせる
    var el = document.querySelector('#hkAccordion .hk-chap[data-chap="' + no + '"]');
    if (el && openSet[no]) {
      var y = el.getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo(0, y);
    }
  }

  function markRead(no) {
    readMap[no] = !readMap[no];
    save(K.read, readMap);
    renderNote();
  }

  function openAll(flag) {
    openSet = {};
    if (flag) { for (var c = 0; c < NOTE.length; c++) openSet[NOTE[c].no] = true; }
    renderNote();
  }

  /* =================================================================
     8. 章えらび画面
     ================================================================= */
  function renderChapterSelect() {
    var ul = $('hkChapterList');
    if (!ul) return;
    var html = '';
    for (var c = 0; c < NOTE.length; c++) {
      var ch = NOTE[c];
      var ids = idsOfChapter(ch.no);
      var rate = chapterRate(ch.no);
      var rcls = (rate === null) ? 'hk-none' : (rate >= 70 ? '' : 'hk-low');
      var rtxt = (rate === null) ? '未' : rate + '%';

      if (ids.length === 0) {
        html += '<li><button type="button" class="hk-chapter-item" data-hk-action="openChapNote" data-chap="' + ch.no + '">';
        html +=   '<span class="hk-chapter-badge">' + ch.no + '</span>';
        html +=   '<span class="hk-chapter-info">' + fg(ch.title) +
                  '<span class="hk-chapter-sub">読むだけの章です。押すとノートが開きます</span></span>';
        html +=   '<span class="hk-chapter-rate hk-none">📖</span>';
        html += '</button></li>';
      } else {
        html += '<li><button type="button" class="hk-chapter-item" data-hk-action="startChap" data-chap="' + ch.no + '">';
        html +=   '<span class="hk-chapter-badge">' + ch.no + '</span>';
        html +=   '<span class="hk-chapter-info">' + fg(ch.title) +
                  '<span class="hk-chapter-sub">' + ids.length + '問' +
                  (readMap[ch.no] ? '　/　ノート読了' : '　/　ノート未読') + '</span></span>';
        html +=   '<span class="hk-chapter-rate ' + rcls + '">' + rtxt + '</span>';
        html += '</button></li>';
      }
    }
    ul.innerHTML = html;
  }

  /* =================================================================
     9. 出題
     ================================================================= */
  var S = {
    mode: 'all',
    queue: [],
    idx: 0,
    picked: null,       // 画面に出ていた番号（1から）
    pickedOrig: null,   // データ上の本来の番号（1から）
    order: null,        // 画面の並び順（中身はデータ上の添字0から）
    orderFor: null,     // その並び順がどの問題のものか
    correctCount: 0,
    wrongIds: [],
    streak: 0,
    bestStreak: 0,
    startAt: 0,
    baseMs: 0,      // 再開したときの前回までの時間
    qStartAt: 0,
    lastMs: 0,
    confPicked: null
  };

  function startQuiz(mode, ids, resumeData) {
    if (!ids || !ids.length) return;
    S.mode = mode;
    S.queue = ids.slice();
    S.idx = 0;
    S.correctCount = 0;
    S.wrongIds = [];
    S.streak = 0;
    S.bestStreak = 0;
    S.baseMs = 0;
    S.order = null;
    S.orderFor = null;

    if (resumeData) {
      S.idx = resumeData.idx || 0;
      S.correctCount = resumeData.correctCount || 0;
      S.wrongIds = resumeData.wrongIds || [];
      S.baseMs = resumeData.ms || 0;
    }
    S.startAt = Date.now();
    touchDays();
    show('hkQuiz');
    renderQuestion();
  }

  function currentQ() { return QMAP[S.queue[S.idx]]; }

  // 並び順を用意する。すでに同じ問題の並びがあれば、そのまま使います。
  // （ふりがなを切り替えても並びが変わらないようにするため）
  function buildOrder(q) {
    var n = q.choices ? q.choices.length : 0;
    if (S.orderFor === q.id && S.order && S.order.length === n) return;
    var doShuffle = shuffleOn && !isFixedOrder(q);
    S.order = doShuffle ? shuffledIdx(n) : seqIdx(n);
    S.orderFor = q.id;
  }

  function renderQuestion() {
    var q = currentQ();
    if (!q) { finishQuiz(); return; }

    S.picked = null;
    S.pickedOrig = null;
    S.confPicked = null;
    S.qStartAt = Date.now();

    buildOrder(q);

    if ($('hkProgressText')) $('hkProgressText').textContent = (S.idx + 1) + ' / ' + S.queue.length;
    if ($('hkProgressFill')) $('hkProgressFill').style.width = Math.round(S.idx / S.queue.length * 100) + '%';
    if ($('hkQuizNo'))   $('hkQuizNo').textContent   = '予想問題 ' + q.id;
    if ($('hkQuizTag'))  $('hkQuizTag').textContent  = '第' + q.chapter + '章';
    if ($('hkQuizStar')) $('hkQuizStar').textContent = starMark(q.star || 1);

    var st = $('hkQuizStreak');
    if (st) {
      if (S.streak >= 2) {
        st.hidden = false;
        st.textContent = '🔥 ' + S.streak + '問連続で正解中';
      } else {
        st.hidden = true;
      }
    }

    if ($('hkQuizQuestion')) $('hkQuizQuestion').innerHTML = fg(q.question);

    paintShuffle();

    var ul = $('hkChoices');
    if (ul) {
      var html = '';
      for (var j = 0; j < S.order.length; j++) {
        var oi = S.order[j];
        html += '<li><button type="button" class="hk-choice" data-hk-action="pick" data-pick="' + (j + 1) + '">';
        html +=   '<span class="hk-choice-num">' + (j + 1) + '</span>';
        html +=   '<span class="hk-choice-text">' + fg(q.choices[oi]) + '</span>';
        html += '</button></li>';
      }
      ul.innerHTML = html;
    }
    saveResume();
  }

  function pick(n) {
    if (S.picked !== null) return;
    var q = currentQ();
    if (!q || !S.order || n < 1 || n > S.order.length) return;

    S.picked = n;                       // 画面に出ていた番号
    S.pickedOrig = S.order[n - 1] + 1;  // データ上の番号
    S.lastMs = Date.now() - S.qStartAt;

    var ok = (S.pickedOrig === q.answer);
    var r = qrec(q.id);
    r.n += 1;
    if (ok) r.ok += 1;
    r.lastOk = ok;
    r.lastMs = S.lastMs;
    r.conf = null;                 // 手ごたえは次に押されるまで空
    save(K.stats, stats);

    if (ok) {
      S.correctCount += 1;
      S.streak += 1;
      if (S.streak > S.bestStreak) S.bestStreak = S.streak;
    } else {
      S.streak = 0;
      S.wrongIds.push(q.id);
    }

    show('hkResult');
    renderResult();
  }

  /* =================================================================
     10. 解答・解説
     ================================================================= */
  function renderResult() {
    var q = currentQ();
    if (!q) return;
    if (!S.order || S.orderFor !== q.id) buildOrder(q);

    var ok = (S.pickedOrig === q.answer);

    // 正解が画面では何番だったか
    var ansPos = 0;
    for (var a = 0; a < S.order.length; a++) {
      if (S.order[a] + 1 === q.answer) { ansPos = a + 1; break; }
    }

    if ($('hkResultIcon')) $('hkResultIcon').textContent = ok ? '⭕' : '✕';
    var rt = $('hkResultText');
    if (rt) {
      rt.textContent = ok ? '正解！' : 'おしい！';
      rt.className = 'hk-result-text ' + (ok ? 'hk-ok' : 'hk-ng');
    }
    if ($('hkResultTime')) $('hkResultTime').textContent = 'かかった時間 ' + fmtTime(S.lastMs);
    if ($('hkResultAnswer')) $('hkResultAnswer').textContent = ansPos;

    // 選択肢のふりかえり（画面に出ていた並びのまま見せます）
    var ul = $('hkReviewChoices');
    if (ul) {
      var html = '';
      for (var j = 0; j < S.order.length; j++) {
        var oi = S.order[j];
        var n = j + 1;
        var isC = (oi + 1 === q.answer);
        var isP = (n === S.picked);
        var cls = 'hk-review-item' + (isC ? ' hk-is-correct' : '') + ((isP && !isC) ? ' hk-is-picked' : '');
        var mark = isC ? '○' : (isP ? '✓' : '×');
        html += '<li class="' + cls + '">';
        html +=   '<span class="hk-review-mark">' + mark + '</span>';
        html +=   '<span class="hk-review-body">' + n + '　' + fg(q.choices[oi]);
        if (q.why && q.why[oi]) html += '<span class="hk-review-why">' + fg(q.why[oi]) + '</span>';
        html +=   '</span>';
        html += '</li>';
      }
      ul.innerHTML = html;
    }

    if ($('hkResultExplanation')) $('hkResultExplanation').innerHTML = fg(q.explanation || '');

    var pbox = $('hkResultPointBox');
    if (pbox) {
      if (q.point) {
        pbox.classList.remove('hidden');
        if ($('hkResultPoint')) $('hkResultPoint').innerHTML = fg(q.point);
      } else {
        pbox.classList.add('hidden');
      }
    }

    // ノートへ飛ぶボタン
    var jb = $('hkJumpBtn');
    if (jb) {
      var ref = q.note || q.id;
      jb.setAttribute('data-note', ref);
      jb.innerHTML = '📖 ノートの ' + ref + ' を開く';
    }

    // 手ごたえボタンをまっさらに戻す
    var cbs = document.querySelectorAll('#hkConfidence .hk-confidence-btn');
    for (var m = 0; m < cbs.length; m++) cbs[m].classList.remove('hk-selected');
    if ($('hkConfidenceHint')) {
      $('hkConfidenceHint').textContent = ok
        ? '「まぐれ」も正直に押してください。あとで出しなおします。'
        : 'まちがえたときこそ、正直に押すと復習の精度が上がります。';
    }
  }

  function setConfidence(level, btn) {
    var q = currentQ();
    if (!q || S.picked === null) return;
    S.confPicked = level;

    var r = qrec(q.id);
    r.conf = level;
    save(K.stats, stats);

    var cbs = document.querySelectorAll('#hkConfidence .hk-confidence-btn');
    for (var m = 0; m < cbs.length; m++) cbs[m].classList.remove('hk-selected');
    if (btn) btn.classList.add('hk-selected');

    var ok = (S.pickedOrig === q.answer);
    var hint;
    if (ok && level === 'sure') {
      hint = 'その調子です。理由まで言えたら完ぺき。';
    } else if (ok) {
      hint = '当たりましたが、まぐれかもしれません。復習モードにも入れておきます。';
    } else if (level === 'sure') {
      hint = '⚠️ 危険ゾーンに入れました。ここを直すと点がいちばん伸びます。';
    } else {
      hint = 'だいじょうぶ。いま覚えれば本番で取れます。';
    }
    if ($('hkConfidenceHint')) $('hkConfidenceHint').textContent = hint;
  }

  function nextQuestion() {
    S.idx += 1;
    S.order = null;
    S.orderFor = null;
    if (S.idx >= S.queue.length) { finishQuiz(); return; }
    show('hkQuiz');
    renderQuestion();
  }

  function jumpToNote(ref) {
    // ノート画面を開いて、その項目まで移動する
    var chap = parseInt(String(ref).split('-')[0], 10);
    openSet[chap] = true;
    star3Only = false;
    show('hkNote');
    renderNote();
    var el = $('hkItem_' + ref);
    if (el) {
      var y = el.getBoundingClientRect().top + window.pageYOffset - 16;
      window.scrollTo(0, y);
      el.style.borderColor = 'var(--accent)';
      setTimeout(function () { el.style.borderColor = ''; }, 1800);
    }
  }

  /* =================================================================
     11. 結果まとめ
     ================================================================= */
  var lastSession = null;

  function finishQuiz() {
    var ms = S.baseMs + (Date.now() - S.startAt);
    var total = S.queue.length;
    var score = S.correctCount;
    var rate = total ? Math.round(score / total * 100) : 0;

    stats.sessions.push({
      date: todayKey(), mode: S.mode, score: score, total: total, ms: ms
    });
    if (stats.sessions.length > 50) stats.sessions.shift();
    save(K.stats, stats);
    remove(K.resume);

    lastSession = { wrongIds: S.wrongIds.slice(), queue: S.queue.slice(), mode: S.mode };

    if ($('hkSummaryScore')) $('hkSummaryScore').textContent = score;
    if ($('hkSummaryTotal')) $('hkSummaryTotal').textContent = '/ ' + total + '問中';
    if ($('hkSummaryFill'))  $('hkSummaryFill').style.width = rate + '%';
    if ($('hkSummaryTime'))  {
      $('hkSummaryTime').textContent =
        'かかった時間 ' + fmtTime(ms) + '　/　1問あたり ' + fmtTime(total ? ms / total : 0);
    }

    var emoji, msg;
    if (rate === 100)      { emoji = '🏆'; msg = '全問正解です。<br>この範囲は本番で落としません。'; }
    else if (rate >= 80)   { emoji = '🎉'; msg = '合格ラインを超えています。<br>まちがえた問題だけ拾いましょう。'; }
    else if (rate >= 60)   { emoji = '💪'; msg = 'あと一歩。<br>まちがえた章をもう一度読めば届きます。'; }
    else                   { emoji = '🌱'; msg = 'ここが伸びしろです。<br>まちがえた問題こそ、本番の点になります。'; }
    if (S.bestStreak >= 3) msg += '<br>🔥 最高 ' + S.bestStreak + '問連続正解';
    if ($('hkSummaryEmoji')) $('hkSummaryEmoji').textContent = emoji;
    if ($('hkSummaryMsg'))   $('hkSummaryMsg').innerHTML = msg;

    // つぎにやるといいこと
    var ul = $('hkTodoList');
    if (ul) {
      var byChap = {};
      for (var j = 0; j < S.wrongIds.length; j++) {
        var q = QMAP[S.wrongIds[j]];
        if (!q) continue;
        byChap[q.chapter] = (byChap[q.chapter] || 0) + 1;
      }
      var html = '';
      for (var c = 0; c < NOTE.length; c++) {
        var no = NOTE[c].no;
        if (byChap[no]) {
          html += '<li class="hk-todo-item">第' + no + '章「' + fg(NOTE[c].title) +
                  '」をもう一度読む（まちがえ ' + byChap[no] + '問）</li>';
        }
      }
      var dg = dangerIds();
      if (dg.length) {
        html += '<li class="hk-todo-item">危険ゾーンが ' + dg.length +
                '問あります。メニューの「⚠️ 危険ゾーンだけ」で先に片づけましょう。</li>';
      }
      if (!html) {
        html = '<li class="hk-todo-item">いまのところ、やり残しはありません。<br>' +
               '数日あけてもう一度解くと、記憶がしっかり定着します。</li>';
      }
      ul.innerHTML = html;
    }

    var rw = $('hkRetryWrongBtn');
    if (rw) {
      if (S.wrongIds.length) {
        rw.classList.remove('hk-disabled');
        rw.innerHTML = '🎯 まちがえた ' + S.wrongIds.length + '問だけもう一度';
      } else {
        rw.classList.add('hk-disabled');
        rw.innerHTML = '🎯 まちがえた問題はありません';
      }
    }

    show('hkSummary');
  }

  /* =================================================================
     12. 中断と再開
     ================================================================= */
  function saveResume() {
    if (!S.queue.length) return;
    save(K.resume, {
      mode: S.mode,
      queue: S.queue,
      idx: S.idx,
      correctCount: S.correctCount,
      wrongIds: S.wrongIds,
      ms: S.baseMs + (Date.now() - S.startAt)
    });
  }

  function quitQuiz() {
    saveResume();
    show('hkMenu');
    renderMenu();
  }

  function doResume() {
    var res = load(K.resume, null);
    if (!res || !res.queue || !res.queue.length) return;
    // 消えた問題idを取りのぞく（データを直したときの保険）
    var ids = [];
    for (var j = 0; j < res.queue.length; j++) { if (QMAP[res.queue[j]]) ids.push(res.queue[j]); }
    if (!ids.length) { remove(K.resume); renderMenu(); return; }
    if (res.idx >= ids.length) res.idx = 0;
    startQuiz(res.mode, ids, res);
  }

  /* =================================================================
     13. じぶんの記録
     ================================================================= */
  function renderStats() {
    var box = $('hkStatsBody');
    if (!box) return;

    var html = '';
    var rate = overallRate();
    html += '<div class="hk-stats-row">';
    html +=   '<div class="hk-stats-head"><span>ぜんたい</span>' +
              '<span class="hk-stats-num ' + (rate === null ? 'hk-none' : (rate >= 70 ? '' : 'hk-low')) + '">' +
              (rate === null ? '未' : rate + '%') + '</span></div>';
    html +=   '<div class="hk-stats-bar"><div class="hk-stats-fill' + (rate !== null && rate < 70 ? ' hk-low' : '') +
              '" style="width:' + (rate === null ? 0 : rate) + '%"></div></div>';
    html +=   '<div class="hk-stats-sub">解いた問題 ' + solvedCount() + ' / ' + TOTAL_Q +
              '　読んだ章 ' + readCount() + ' / ' + TOTAL_CHAP + '</div>';
    html += '</div>';

    for (var c = 0; c < NOTE.length; c++) {
      var ch = NOTE[c];
      var ids = idsOfChapter(ch.no);
      if (!ids.length) continue;
      var r = chapterRate(ch.no);
      var cls = (r === null) ? 'hk-none' : (r >= 70 ? '' : 'hk-low');
      var done = 0, ms = 0;
      for (var j = 0; j < ids.length; j++) {
        var rr = stats.q[ids[j]];
        if (rr && rr.n > 0) { done++; ms += rr.lastMs || 0; }
      }
      html += '<div class="hk-stats-row">';
      html +=   '<div class="hk-stats-head"><span>第' + ch.no + '章　' + fg(ch.title) + '</span>' +
                '<span class="hk-stats-num ' + cls + '">' + (r === null ? '未' : r + '%') + '</span></div>';
      html +=   '<div class="hk-stats-bar"><div class="hk-stats-fill' + (r !== null && r < 70 ? ' hk-low' : '') +
                '" style="width:' + (r === null ? 0 : r) + '%"></div></div>';
      html +=   '<div class="hk-stats-sub">' + done + ' / ' + ids.length + '問を解答' +
                (done ? ('　直近の合計 ' + fmtTime(ms)) : '') +
                (readMap[ch.no] ? '　/　ノート読了' : '') + '</div>';
      html += '</div>';
    }

    // 直近の挑戦
    if (stats.sessions.length) {
      html += '<div class="hk-section-title">さいきんの挑戦</div>';
      var from = Math.max(0, stats.sessions.length - 5);
      for (var s = stats.sessions.length - 1; s >= from; s--) {
        var se = stats.sessions[s];
        var sr = se.total ? Math.round(se.score / se.total * 100) : 0;
        html += '<div class="hk-stats-row"><div class="hk-stats-head">' +
                '<span>' + se.date + '　' + modeLabel(se.mode) + '</span>' +
                '<span class="hk-stats-num ' + (sr >= 70 ? '' : 'hk-low') + '">' +
                se.score + '/' + se.total + '</span></div>' +
                '<div class="hk-stats-sub">かかった時間 ' + fmtTime(se.ms) + '</div></div>';
      }
    }

    box.innerHTML = html;
  }

  function clearStats() {
    if (!window.confirm('法改正編の記録（読んだ章・正解率・手ごたえ）をすべて消します。\n過去問の記録は消えません。よろしいですか？')) return;
    readMap = {};
    stats = { q: {}, sessions: [] };
    save(K.read, readMap);
    save(K.stats, stats);
    remove(K.resume);
    renderStats();
    renderMenu();
    window.alert('法改正編の記録を消しました。');
  }

  /* =================================================================
     14. クリックのふりわけ
     ================================================================= */
  function onClick(e) {
    // data-hk-action を持つ親をさがす
    var t = e.target;
    while (t && t !== document.body) {
      if (t.getAttribute && t.getAttribute('data-hk-action')) break;
      t = t.parentNode;
    }

    // 手ごたえボタン（data-level）
    var cb = e.target;
    while (cb && cb !== document.body) {
      if (cb.classList && cb.classList.contains('hk-confidence-btn')) {
        setConfidence(cb.getAttribute('data-level'), cb);
        return;
      }
      cb = cb.parentNode;
    }

    if (!t || t === document.body) return;
    var a = t.getAttribute('data-hk-action');

    switch (a) {
      case 'openNote':
        show('hkNote'); renderNote(); break;

      case 'backToMenu':
        show('hkMenu'); renderMenu(); break;

      case 'openChapter':
        show('hkChapterSelect'); renderChapterSelect(); break;

      case 'openAll':  openAll(true); break;
      case 'closeAll': openAll(false); break;
      case 'onlyStar3':
        star3Only = !star3Only;
        applyStar3Filter();
        break;

      case 'toggleChap': toggleChap(parseInt(t.getAttribute('data-chap'), 10)); break;
      case 'markRead':   markRead(parseInt(t.getAttribute('data-chap'), 10)); break;

      case 'toggleShuffle': toggleShuffle(); break;

      case 'startAll':
        startQuiz('all', allIds()); break;

      case 'startChap': {
        var no = parseInt(t.getAttribute('data-chap'), 10);
        startQuiz('chap' + no, idsOfChapter(no));
        break;
      }
      case 'openChapNote': {
        var cn = parseInt(t.getAttribute('data-chap'), 10);
        openSet[cn] = true;
        show('hkNote'); renderNote();
        var el2 = document.querySelector('#hkAccordion .hk-chap[data-chap="' + cn + '"]');
        if (el2) window.scrollTo(0, el2.getBoundingClientRect().top + window.pageYOffset - 12);
        break;
      }

      case 'startReview': {
        var rv = reviewIds();
        if (!rv.length) return;
        startQuiz('review', rv);
        break;
      }
      case 'startDanger': {
        var dg = dangerIds();
        if (!dg.length) return;
        startQuiz('danger', dg);
        break;
      }
      case 'resume': doResume(); break;

      case 'pick': pick(parseInt(t.getAttribute('data-pick'), 10)); break;
      case 'nextQuestion': nextQuestion(); break;
      case 'quitQuiz': quitQuiz(); break;
      case 'jumpToNote': jumpToNote(t.getAttribute('data-note')); break;

      case 'retryWrong':
        if (lastSession && lastSession.wrongIds.length) startQuiz('wrong', lastSession.wrongIds);
        break;
      case 'retryQuiz':
        if (lastSession && lastSession.queue.length) startQuiz(lastSession.mode, lastSession.queue);
        break;

      case 'openStats': show('hkStats'); renderStats(); break;
      case 'clearStats': clearStats(); break;
    }
  }

  /* =================================================================
     15. キーボード（パソコンで解く人むけ）
     ================================================================= */
  function onKey(e) {
    if (current === 'hkQuiz') {
      var n = parseInt(e.key, 10);
      var q = currentQ();
      if (q && n >= 1 && n <= q.choices.length) { pick(n); }
    } else if (current === 'hkResult') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextQuestion(); }
    }
  }

  /* =================================================================
     16. 起動
     ================================================================= */
  function init() {
    // データが読めているか確認
    if (!NOTE.length || !QUIZ.length) {
      var d = $('hkDashMsg');
      if (d) {
        d.innerHTML = '⚠️ データを読みこめていません。<br>' +
                      'data/note.js と data/quiz.js が houkaisei/data/ の中にあるか確認してください。';
      }
    }

    paintFurigana();
    var sw = $('hkFuriganaSwitch');
    if (sw) {
      sw.addEventListener('click', toggleFurigana);
      sw.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFurigana(); }
      });
    }

    mountShuffleToggle();

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);

    // 途中でページを閉じても続きから再開できるように
    window.addEventListener('beforeunload', function () {
      if (current === 'hkQuiz' || current === 'hkResult') saveResume();
    });

    show('hkMenu');
    renderMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
