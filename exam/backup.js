// backup.js – 学習記録の書き出し・読みこみ
// storage.js / trend.js より後に読み込むこと

(function () {
  'use strict';

  var TREND_KEY = 'kaigo_daily_v1';
  var KEYS = {
    state:   'kaigo_exam_state_v1',
    log:     'kaigo_exam_log_v1',
    pref:    'kaigo_exam_pref_v1',
    session: 'kaigo_exam_session_v1',
    daily:   TREND_KEY
  };

  function raw(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function setRaw(k, v) {
    try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function parse(s, fb) {
    try { var v = JSON.parse(s); return (v === null || v === undefined) ? fb : v; }
    catch (e) { return fb; }
  }

  /* ===== データの消えにくさを申請する ===== */
  function askPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted().then(function (already) {
          if (!already) navigator.storage.persist();
        });
      }
    } catch (e) {}
  }

  /* ===== 書き出し ===== */
  function buildData() {
    return {
      app: 'kaigo-manabi',
      version: 1,
      savedAt: new Date().toISOString(),
      state:   parse(raw(KEYS.state), {}),
      log:     parse(raw(KEYS.log), []),
      pref:    parse(raw(KEYS.pref), {}),
      daily:   parse(raw(KEYS.daily), {})
    };
  }

  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
         + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function doExport() {
    var data = buildData();
    var text = JSON.stringify(data);
    var name = 'kaigo-kiroku-' + stamp() + '.json';
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      note('保存しました。ファイル名は ' + name + ' です。'
         + 'クラウドやメールに置いておくと安心です。', 'ok');
    } catch (e) {
      note('この端末では保存できませんでした。', 'ng');
    }
  }

  /* ===== 読みこみ ===== */
  function countOf(d) {
    var n = 0, k;
    if (d.state) { for (k in d.state) { if (d.state.hasOwnProperty(k)) n++; } }
    return n;
  }

  function doImport(file) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var d = parse(String(fr.result), null);
      if (!d || d.app !== 'kaigo-manabi' || !d.state) {
        note('このファイルは読みこめませんでした。'
           + 'このアプリで保存したファイルをえらんでください。', 'ng');
        return;
      }
      var now = countOf(buildData());
      var add = countOf(d);
      var msg = '読みこむと、いまの記録（' + now + '問）は'
              + 'ファイルの記録（' + add + '問）に置きかわります。よろしいですか？';
      if (!window.confirm(msg)) return;

      var ok = true;
      ok = setRaw(KEYS.state, JSON.stringify(d.state || {})) && ok;
      ok = setRaw(KEYS.log,   JSON.stringify(d.log   || [])) && ok;
      ok = setRaw(KEYS.pref,  JSON.stringify(d.pref  || {})) && ok;
      ok = setRaw(KEYS.daily, JSON.stringify(d.daily || {})) && ok;
      try { window.localStorage.removeItem(KEYS.session); } catch (e) {}

      if (ok) {
        note('読みこみました。画面を作りなおします。', 'ok');
        setTimeout(function () { window.location.reload(); }, 1200);
      } else {
        note('とちゅうで保存できませんでした。空き容量をたしかめてください。', 'ng');
      }
    };
    fr.onerror = function () { note('ファイルを読めませんでした。', 'ng'); };
    fr.readAsText(file);
  }

  /* ===== 表示 ===== */
  function note(text, kind) {
    var el = document.getElementById('bkNote');
    if (!el) { window.alert(text); return; }
    el.className = 'bk-note ' + (kind || '');
    el.textContent = text;
  }

  function html() {
    return '<div class="bk">'
      + '<div class="bk-head">💾 記録のバックアップ</div>'
      + '<div class="bk-text">学習の記録はこの端末の中だけに保存されています。'
      + 'ブラウザのデータを消したり、スマホを買いかえると記録は消えます。'
      + 'ときどきファイルに保存しておくと、あとで元にもどせます。</div>'
      + '<div class="bk-btns">'
      +   '<button type="button" class="bk-btn save" id="bkSave">記録をファイルに保存</button>'
      +   '<button type="button" class="bk-btn load" id="bkLoad">ファイルから読みこむ</button>'
      + '</div>'
      + '<input type="file" id="bkFile" accept=".json,application/json" style="display:none">'
      + '<div class="bk-note" id="bkNote"></div>'
      + '</div>';
  }

  function bind() {
    var s = document.getElementById('bkSave');
    var l = document.getElementById('bkLoad');
    var f = document.getElementById('bkFile');
    if (s) s.onclick = doExport;
    if (l && f) l.onclick = function () { f.value = ''; f.click(); };
    if (f) f.onchange = function () { doImport(f.files && f.files[0]); };
  }

  function injectCSS() {
    if (document.getElementById('bkStyle')) return;
    var st = document.createElement('style');
    st.id = 'bkStyle';
    st.textContent =
      '.bk{background:#fff;border:1px solid #e6e6e6;border-radius:12px;padding:14px;margin-top:16px}'
    + '.bk-head{font-weight:bold;font-size:15px;margin-bottom:8px;color:#333}'
    + '.bk-text{font-size:12px;color:#666;line-height:1.7;margin-bottom:12px}'
    + '.bk-btns{display:flex;gap:8px;flex-wrap:wrap}'
    + '.bk-btn{flex:1;min-width:140px;padding:11px 8px;border-radius:9px;font-size:13px;'
    +   'font-weight:700;cursor:pointer;border:2px solid transparent}'
    + '.bk-btn.save{background:#c2700f;color:#fff;border-color:#fff3}'
    + '.bk-btn.load{background:#fff;color:#5a4a2f;border-color:#cbbba0}'
    + '.bk-note{font-size:12px;line-height:1.6;margin-top:10px;color:#666}'
    + '.bk-note.ok{color:#1f6f45}'
    + '.bk-note.ng{color:#b03030}';
    document.head.appendChild(st);
  }

  askPersist();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }

  window.KaigoBackup = { html: html, bind: bind, data: buildData };

})();
