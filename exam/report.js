// trend.js – 学習の推移（日別サマリー）
// storage.js より後に読み込むこと。storage.js / app.js は変更不要。

(function () {
  'use strict';

  var DAY_KEY = 'kaigo_daily_v1';
  var BF_KEY  = 'kaigo_daily_bf_v1';
  var KEEP_DAYS = 400;
  var SHOW_DAYS = 10;   // グラフに出す「学習した日」の数

  /* ===== 保存の土台（localStorage が使えない環境ではメモリに退避） ===== */
  var mem = {};
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function readRaw(k) {
    var s = ls();
    try { if (s) return s.getItem(k); } catch (e) {}
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
  }
  function writeRaw(k, v) {
    var s = ls();
    try { if (s) { s.setItem(k, v); return; } } catch (e) {}
    mem[k] = v;
  }

  function readDaily() {
    try {
      var o = JSON.parse(readRaw(DAY_KEY) || '{}');
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }
  function writeDaily(o) {
    var keys = Object.keys(o).sort();
    if (keys.length > KEEP_DAYS) {
      keys.slice(0, keys.length - KEEP_DAYS).forEach(function (k) { delete o[k]; });
    }
    try { writeRaw(DAY_KEY, JSON.stringify(o)); } catch (e) {}
  }

  function dkey(d) {
    var y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function shiftKey(days) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return dkey(d);
  }
  function mdLabel(k) {
    var p = k.split('-');
    return Number(p[1]) + '/' + Number(p[2]);
  }

  /* ===== 1問ぶんの記録 ===== */
  function bump(correct) {
    var o = readDaily(), k = dkey(new Date());
    if (!o[k]) o[k] = { n: 0, c: 0 };
    o[k].n++;
    if (correct) o[k].c++;
    writeDaily(o);
  }

  /* ===== 正解数の合計（正誤判定に使う） ===== */
  function sumCorrect() {
    var S = window.KaigoStore, t = 0, k, st, all;
    if (!S || typeof S.getAllStates !== 'function') return null;
    try {
      all = S.getAllStates() || {};
      for (k in all) {
        if (!Object.prototype.hasOwnProperty.call(all, k)) continue;
        st = all[k];
        if (st && typeof st.o === 'number') t += st.o;
      }
    } catch (e) { return null; }
    return t;
  }

  /* ===== recordAnswer を包む ===== */
  function hook() {
    var S = window.KaigoStore;
    if (!S || typeof S.recordAnswer !== 'function' || S.__trendHooked) return;
    var orig = S.recordAnswer;
    S.recordAnswer = function () {
      var before = sumCorrect();
      var r = orig.apply(this, arguments);
      try {
        var after = sumCorrect(), ok = false, i;
        if (before !== null && after !== null) {
          ok = (after > before);
        } else {
          for (i = 0; i < arguments.length; i++) {
            if (typeof arguments[i] === 'boolean') { ok = arguments[i]; break; }
          }
        }
        bump(ok);
      } catch (e) {}
      return r;
    };
    S.__trendHooked = true;
  }

  /* ===== 過去ログからの取り込み（初回だけ） ===== */
  var TIME_FIELDS = ['t', 'ts', 'd', 'time', 'date', 'at'];
  var OK_FIELDS   = ['o', 'ok', 'c', 'correct', 'r', 'res'];

  function plausibleTime(v) {
    return typeof v === 'number' && v > 1300000000000 && v < Date.now() + 86400000;
  }
  function findTimeField(sample) {
    var i, k;
    for (i = 0; i < TIME_FIELDS.length; i++) {
      k = TIME_FIELDS[i];
      if (plausibleTime(sample[k])) return k;
    }
    for (k in sample) {
      if (Object.prototype.hasOwnProperty.call(sample, k) && plausibleTime(sample[k])) return k;
    }
    return null;
  }
  function findOkField(arr) {
    var i, k, j, v, onlyBin;
    for (i = 0; i < OK_FIELDS.length; i++) {
      k = OK_FIELDS[i];
      if (typeof arr[0][k] === 'boolean') return k;
    }
    for (k in arr[0]) {
      if (!Object.prototype.hasOwnProperty.call(arr[0], k)) continue;
      if (typeof arr[0][k] === 'boolean') return k;
    }
    for (i = 0; i < OK_FIELDS.length; i++) {
      k = OK_FIELDS[i];
      if (!(k in arr[0])) continue;
      onlyBin = true;
      for (j = 0; j < Math.min(arr.length, 40); j++) {
        v = arr[j][k];
        if (v !== 0 && v !== 1) { onlyBin = false; break; }
      }
      if (onlyBin) return k;
    }
    return null;
  }

  function backfill() {
    if (readRaw(BF_KEY)) return;
    var s = ls(), best = null, i, k, v, tf;
    if (s) {
      for (i = 0; i < s.length; i++) {
        k = s.key(i);
        if (!k || k === DAY_KEY) continue;
        try { v = JSON.parse(s.getItem(k)); } catch (e) { continue; }
        if (!Array.isArray(v) || v.length === 0) continue;
        if (!v[0] || typeof v[0] !== 'object') continue;
        tf = findTimeField(v[0]);
        if (!tf) continue;
        if (!best || v.length > best.arr.length) {
          best = { arr: v, tf: tf, of: findOkField(v), key: k };
        }
      }
    }
    if (best) {
      var o = readDaily(), added = 0;
      best.arr.forEach(function (e) {
        if (!e || !plausibleTime(e[best.tf])) return;
        var d = dkey(new Date(e[best.tf]));
        if (!o[d]) o[d] = { n: 0, c: 0 };
        o[d].n++;
        if (best.of && (e[best.of] === true || e[best.of] === 1)) o[d].c++;
        added++;
      });
      writeDaily(o);
      try {
        console.log('[trend] 過去ログを取り込みました: key=' + best.key
          + ' 件数=' + added + ' 時刻項目=' + best.tf + ' 正誤項目=' + best.of);
      } catch (e2) {}
    }
    writeRaw(BF_KEY, '1');
  }

  /* ===== 集計 ===== */
  function series() {
    var o = readDaily();
    return Object.keys(o)
      .filter(function (k) { return o[k] && o[k].n > 0; })
      .sort()
      .map(function (k) { return { d: k, n: o[k].n, c: o[k].c }; });
  }
  function totals() {
    var t = { n: 0, c: 0 };
    series().forEach(function (p) { t.n += p.n; t.c += p.c; });
    return t;
  }
  function streak() {
    var o = readDaily(), d = new Date(), n = 0;
    d.setHours(0, 0, 0, 0);
    if (!(o[dkey(d)] && o[dkey(d)].n > 0)) d.setDate(d.getDate() - 1);
    while (o[dkey(d)] && o[dkey(d)].n > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function windowSum(fromDays, toDays) {
    var o = readDaily(), a = shiftKey(fromDays), b = shiftKey(toDays);
    var t = { n: 0, c: 0 };
    Object.keys(o).forEach(function (k) {
      if (k >= a && k <= b) { t.n += o[k].n; t.c += o[k].c; }
    });
    return t;
  }
  function rate(t) { return t.n ? Math.round(t.c / t.n * 100) : 0; }

  /* ===== グラフ ===== */
  function chartSVG(pts) {
    if (!pts.length) return '';
    var W = 320, H = 128, L = 26, R = 12, T = 18, B = 26;
    var iw = W - L - R, ih = H - T - B, n = pts.length;
    function X(i) { return n === 1 ? (L + iw / 2) : (L + iw * i / (n - 1)); }
    function Y(v) { return T + ih * (1 - v / 100); }

    var s = '<svg class="trd-svg" viewBox="0 0 ' + W + ' ' + H
          + '" role="img" aria-label="正答率のうつりかわり">';

    [0, 60, 100].forEach(function (v) {
      var y = Y(v), dash = (v === 60) ? ' stroke-dasharray="3 3"' : '';
      var col = (v === 60) ? '#f0a020' : '#e2e2e2';
      s += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y
        + '" stroke="' + col + '" stroke-width="1"' + dash + '/>';
      s += '<text x="' + (L - 4) + '" y="' + (y + 3)
        + '" font-size="8" fill="#999" text-anchor="end">' + v + '</text>';
    });

    var poly = pts.map(function (p, i) {
      return X(i).toFixed(1) + ',' + Y(rate(p)).toFixed(1);
    }).join(' ');
    if (n > 1) {
      s += '<polyline points="' + poly + '" fill="none" stroke="#2f8f5b" stroke-width="2" '
        + 'stroke-linejoin="round" stroke-linecap="round"/>';
    }
    pts.forEach(function (p, i) {
      var last = (i === n - 1);
      s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(rate(p)).toFixed(1)
        + '" r="' + (last ? 3.6 : 2.4) + '" fill="' + (last ? '#1f6f45' : '#2f8f5b') + '"/>';
    });

    var lastP = pts[n - 1], lr = rate(lastP);
    var ly = Y(lr), below = (ly - T) < 13;
    s += '<text x="' + X(n - 1).toFixed(1) + '" y="' + (below ? (ly + 14) : (ly - 8)).toFixed(1)
      + '" font-size="9" fill="#1f6f45" text-anchor="' + (n === 1 ? 'middle' : 'end')
      + '" font-weight="bold" paint-order="stroke" stroke="#fff" stroke-width="3"'
      + ' stroke-linejoin="round">' + lr + '％</text>';

    s += '<text x="' + X(0) + '" y="' + (H - 8)
      + '" font-size="8" fill="#999" text-anchor="' + (n === 1 ? 'middle' : 'start')
      + '">' + mdLabel(pts[0].d) + '</text>';
    if (n > 1) {
      s += '<text x="' + X(n - 1) + '" y="' + (H - 8)
        + '" font-size="8" fill="#999" text-anchor="end">' + mdLabel(lastP.d) + '</text>';
    }
    s += '</svg>';
    return s;
  }

  /* ===== 表示用 HTML ===== */
  function html() {
    var all = series();
    var pts = all.slice(-SHOW_DAYS);
    var tot = totals();
    var st  = streak();
    var w0  = windowSum(-6, 0);
    var w1  = windowSum(-13, -7);

    var msg;
    if (tot.n === 0) {
      msg = 'まだ記録がありません。1問でも解くと、ここに積み上がっていきます。';
    } else if (st >= 2) {
      msg = st + '日つづけています。この積み上げがいちばん効きます。';
    } else if (w0.n > 0) {
      msg = 'この7日で' + w0.n + '問。ペースは作れています。';
    } else {
      msg = 'ひさしぶりですね。10問（約5分）から戻れます。';
    }

    var h = '<div class="trd">';
    h += '<div class="trd-head">📈 学習のうつりかわり</div>';

    h += '<div class="trd-cards">'
      +  '<div class="trd-card"><b>' + st + '</b><span>連続日数</span></div>'
      +  '<div class="trd-card"><b>' + tot.n + '</b><span>解いた数</span></div>'
      +  '<div class="trd-card"><b>' + rate(tot) + '％</b><span>通算の正答率</span></div>'
      +  '</div>';

    if (pts.length) {
      h += '<div class="trd-chart">' + chartSVG(pts) + '</div>';
      h += '<div class="trd-cap">学習した日ごとの正答率（直近' + pts.length + '日ぶん）'
        +  '／オレンジの線は6割の目安</div>';
    } else {
      h += '<div class="trd-cap">問題を解くと、ここに折れ線が出ます。</div>';
    }

    if (w0.n > 0 || w1.n > 0) {
      h += '<div class="trd-cmp">'
        +  '<div><span>この7日</span><b>' + w0.n + '問</b>'
        +  (w0.n ? '（' + rate(w0) + '％）' : '') + '</div>'
        +  '<div><span>前の7日</span><b>' + w1.n + '問</b>'
        +  (w1.n ? '（' + rate(w1) + '％）' : '') + '</div>'
        +  '</div>';
    }

    h += '<div class="trd-msg">' + msg + '</div>';
    h += '<div class="trd-note">この折れ線は「その日に解いた分」の正答率です。'
      +  '下の科目群の数字は「問題ごとの最新の解答」で計算しているため、基準がちがいます。</div>';
    h += '</div>';
    return h;
  }

  /* ===== スタイル ===== */
  function injectCSS() {
    if (document.getElementById('trdStyle')) return;
    var st = document.createElement('style');
    st.id = 'trdStyle';
    st.textContent =
      '.trd{background:#fff;border:1px solid #e6e6e6;border-radius:12px;padding:14px;margin-bottom:16px}'
    + '.trd-head{font-weight:bold;font-size:15px;margin-bottom:10px}'
    + '.trd-cards{display:flex;gap:8px;margin-bottom:12px}'
    + '.trd-card{flex:1;background:#f6f8f7;border-radius:10px;padding:8px 4px;text-align:center}'
    + '.trd-card b{display:block;font-size:19px;color:#1f6f45;line-height:1.2}'
    + '.trd-card span{font-size:10px;color:#777}'
    + '.trd-chart{margin:4px 0}'
    + '.trd-svg{width:100%;height:auto;display:block}'
    + '.trd-cap{font-size:10px;color:#999;text-align:center;margin-top:2px}'
    + '.trd-cmp{display:flex;gap:8px;margin-top:10px;font-size:12px}'
    + '.trd-cmp>div{flex:1;background:#f6f8f7;border-radius:8px;padding:6px 8px}'
    + '.trd-cmp span{color:#777;margin-right:6px}'
    + '.trd-cmp b{color:#333}'
    + '.trd-msg{margin-top:10px;font-size:13px;background:#eef6f1;border-radius:8px;padding:8px 10px;color:#1f6f45}'
    + '.trd-note{margin-top:8px;font-size:10px;color:#aaa;line-height:1.5}';
    document.head.appendChild(st);
  }

  /* ===== 起動 ===== */
  hook();
  backfill();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }

  window.KaigoTrend = {
    html: html,
    record: bump,
    data: readDaily,
    rebuild: function () {
      writeRaw(DAY_KEY, '{}');
      writeRaw(BF_KEY, '');
      backfill();
      return readDaily();
    },
    debug: function () {
      var o = readDaily();
      console.log('今日:', o[dkey(new Date())], '／ 通算:', totals(), '／ 連続:', streak());
      return o;
    }
  };

})();
