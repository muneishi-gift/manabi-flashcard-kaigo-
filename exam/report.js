// report.js – 科目群べつの成績（0点科目群をなくすための画面）
// storage.js より後に読み込むこと

(function () {
  'use strict';

  /* =====================================================
   *  11試験科目群（第39回以降の合格基準にもとづく）
   *  keys = 問題データの科目名。振り分けに使う
   * ===================================================== */
  var GROUPS = [
    { no:1,  part:'A', name:'人間の尊厳と自立、介護の基本',
      kana:'にんげんのそんげんとじりつ、かいごのきほん',
      keys:['人間の尊厳と自立','介護の基本'] },
    { no:2,  part:'A', name:'社会の理解',
      kana:'しゃかいのりかい',
      keys:['社会の理解'] },
    { no:3,  part:'A', name:'人間関係とコミュニケーション、コミュニケーション技術',
      kana:'にんげんかんけいとコミュニケーション、コミュニケーションぎじゅつ',
      keys:['人間関係とコミュニケーション','コミュニケーション技術'] },
    { no:4,  part:'A', name:'生活支援技術',
      kana:'せいかつしえんぎじゅつ',
      keys:['生活支援技術'] },
    { no:5,  part:'B', name:'こころとからだのしくみ',
      kana:'',
      keys:['こころとからだのしくみ'] },
    { no:6,  part:'B', name:'発達と老化の理解',
      kana:'はったつとろうかのりかい',
      keys:['発達と老化の理解'] },
    { no:7,  part:'B', name:'認知症の理解',
      kana:'にんちしょうのりかい',
      keys:['認知症の理解'] },
    { no:8,  part:'B', name:'障害の理解',
      kana:'しょうがいのりかい',
      keys:['障害の理解'] },
    { no:9,  part:'B', name:'医療的ケア',
      kana:'いりょうてきケア',
      keys:['医療的ケア'] },
    { no:10, part:'C', name:'介護過程',
      kana:'かいごかてい',
      keys:['介護過程'] },
    { no:11, part:'C', name:'総合問題',
      kana:'そうごうもんだい',
      keys:['総合問題'] }
  ];

  var PART_POINTS = { A:60, B:45, C:20 };

  /* ---------- 照合用に文字をそろえる ---------- */
  function norm(s) {
    return String(s || '')
      .replace(/（[^）]*）/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/[\s\u3000・･、。，．,.]/g, '');
  }

  var LOOKUP = [];
  GROUPS.forEach(function (g) {
    g.keys.forEach(function (k) { LOOKUP.push({ k: norm(k), g: g }); });
  });
  LOOKUP.sort(function (a, b) { return b.k.length - a.k.length; });

  function groupOf(subject) {
    var n = norm(subject);
    if (!n) return null;
    var i;
    for (i = 0; i < LOOKUP.length; i++) {
      if (n === LOOKUP[i].k) return LOOKUP[i].g;
    }
    for (i = 0; i < LOOKUP.length; i++) {
      if (n.indexOf(LOOKUP[i].k) !== -1) return LOOKUP[i].g;
      if (n.length >= 4 && LOOKUP[i].k.indexOf(n) !== -1) return LOOKUP[i].g;
    }
    return null;
  }

  /* ---------- 集計 ---------- */
  function compute() {
    var states = (window.KaigoStore && window.KaigoStore.getAllStates)
      ? window.KaigoStore.getAllStates() : {};

    var rows = {}, unmatched = {}, k, s, g, r;
    GROUPS.forEach(function (gg) {
      rows[gg.no] = { g: gg, tried: 0, attempts: 0, correct: 0, lastOk: 0 };
    });

    for (k in states) {
      if (!states.hasOwnProperty(k)) continue;
      s = states[k];
      g = groupOf(s.sub);
      if (!g) {
        var nm = s.sub || '（科目未設定）';
        unmatched[nm] = (unmatched[nm] || 0) + 1;
        continue;
      }
      r = rows[g.no];
      r.tried++;
      r.attempts += (s.n || 0);
      r.correct  += (s.o || 0);
      if (s.l) r.lastOk++;
    }

    GROUPS.forEach(function (gg) {
      r = rows[gg.no];
      r.rate = r.tried ? Math.round(r.lastOk / r.tried * 100) : 0;
      if (r.tried === 0)      r.status = 'none';
      else if (r.lastOk === 0) r.status = 'zero';
      else if (r.rate >= 60)   r.status = 'good';
      else                     r.status = 'weak';
    });

    return { rows: rows, unmatched: unmatched };
  }

  /* ---------- 表示 ---------- */
  var overlay = null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function furiganaOn() {
    try {
      return !!(window.KaigoStore && window.KaigoStore.getPref('furigana', false));
    } catch (e) { return false; }
  }

  function close() { if (overlay) overlay.style.display = 'none'; }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'rep-overlay';
    overlay.innerHTML = '<div class="rep-box" role="dialog" aria-modal="true">'
      + '<div class="rep-head">📊 科目群べつの成績</div>'
      + '<div class="rep-body"></div>'
      + '<button type="button" class="rep-close">閉じる</button>'
      + '</div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.className === 'rep-close') close();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  var STATUS_LABEL = {
    none: '未着手',
    zero: '正解ゼロ',
    good: '順調',
    weak: 'もう少し'
  };

  function rowHTML(r) {
    var g = r.g;
    var head = esc(g.name);
    if (g.kana && furiganaOn()) {
      head += '<span class="rep-kana">' + esc(g.kana) + '</span>';
    }
    var bar = (r.status === 'none')
      ? '<div class="rep-bar"><i style="width:0%"></i></div>'
      : '<div class="rep-bar"><i class="' + r.status + '" style="width:' + r.rate + '%"></i></div>';

    var meta = (r.tried === 0)
      ? 'まだ解いていません'
      : r.tried + '問を学習　正解 ' + r.lastOk + '問　' + r.rate + '％';

    return '<div class="rep-row ' + r.status + '">'
      + '<div class="rep-row-top">'
      +   '<span class="rep-no">' + g.no + '</span>'
      +   '<span class="rep-name">' + head + '</span>'
      +   '<span class="rep-status ' + r.status + '">' + STATUS_LABEL[r.status] + '</span>'
      + '</div>'
      + bar
      + '<div class="rep-meta">' + esc(meta) + '</div>'
      + '</div>';
  }

  function partHTML(part, rows) {
    var tried = 0, ok = 0, risk = 0;
    GROUPS.forEach(function (g) {
      if (g.part !== part) return;
      var r = rows[g.no];
      tried += r.tried;
      ok    += r.lastOk;
      if (r.status === 'none' || r.status === 'zero') risk++;
    });
    var rate = tried ? Math.round(ok / tried * 100) : 0;
    return '<div class="rep-part' + (risk ? ' risk' : '') + '">'
      + '<div class="rep-part-name">' + part + 'パート</div>'
      + '<div class="rep-part-num">' + rate + '％</div>'
      + '<div class="rep-part-sub">' + tried + '問／' + PART_POINTS[part] + '点満点'
      + (risk ? '<br>⚠ 危険な科目群 ' + risk : '') + '</div>'
      + '</div>';
  }

  function show() {
    var box  = ensureOverlay();
    var body = box.querySelector('.rep-body');
    var data = compute();
    var rows = data.rows;

    var danger = [];
    GROUPS.forEach(function (g) {
      var r = rows[g.no];
      if (r.status === 'none' || r.status === 'zero') danger.push(g);
    });

    var html = (window.KaigoTrend && window.KaigoTrend.html) ? window.KaigoTrend.html() : '';

    if (danger.length) {
      html += '<div class="rep-alert">'
        + '<div class="rep-alert-title">⚠ 0点になるおそれのある科目群</div>'
        + '<div class="rep-alert-text">試験では、11の科目群のすべてで1点以上とることが必要です。'
        + 'この科目群を先に手当てしましょう。</div><ul class="rep-alert-list">';
      danger.forEach(function (g) {
        html += '<li>' + g.no + '　' + esc(g.name)
             + (rows[g.no].tried === 0 ? '（未着手）' : '（正解ゼロ）') + '</li>';
      });
      html += '</ul></div>';
    } else {
      html += '<div class="rep-alert ok">'
        + '<div class="rep-alert-title">✅ すべての科目群で正解があります</div>'
        + '<div class="rep-alert-text">0点科目群による不合格の心配はいまのところありません。'
        + 'このまま正答率を上げていきましょう。</div></div>';
    }

    html += '<div class="rep-parts">'
         + partHTML('A', rows) + partHTML('B', rows) + partHTML('C', rows)
         + '</div>';

    html += '<div class="rep-list">';
    GROUPS.forEach(function (g) { html += rowHTML(rows[g.no]); });
    html += '</div>';

    var un = Object.keys(data.unmatched);
    if (un.length) {
      html += '<div class="rep-note">振り分けできなかった科目：'
           + esc(un.join('、')) + '</div>';
    }

    html += '<div class="rep-note">'
         + '正答率は、問題ごとの「いちばん新しい解答」で計算しています。'
         + '同じ問題を解き直すと最新の結果に置きかわります。<br>'
         + '合格基準は第39回試験の公表内容にもとづいています。'
         + '受験の年の最新情報は試験センターで確認してください。'
         + '</div>';

    body.innerHTML = html;
    box.style.display = 'flex';
  }

  /* ---------- メニューにボタンを足す ---------- */
  function injectButton() {
    var menu = document.getElementById('mainMenu');
    if (!menu || document.getElementById('reportOpenBtn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id   = 'reportOpenBtn';
    btn.className = 'rep-open-btn';
    btn.textContent = '📊 科目群べつの成績を見る';
    btn.addEventListener('click', show);
    menu.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }

  window.KaigoReport = { show: show, compute: compute, groupOf: groupOf };

})();
