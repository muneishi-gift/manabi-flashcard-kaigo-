// exam/theme.js — 表示設定（ライト/ダーク・文字サイズ3段階）
(function () {
  'use strict';

  var KEY_THEME = 'kaigo_theme_v1';
  var KEY_FS    = 'kaigo_fontsize_v1';
  var SIZES = ['normal', 'large', 'xlarge'];
  var root = document.documentElement;
  var theme, fontSize;

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  // 初回は端末の設定に合わせる（2回目以降は選んだ設定を記憶）
  theme = read(KEY_THEME);
  if (theme !== 'light' && theme !== 'dark') {
    theme = (window.matchMedia &&
             window.matchMedia('(prefers-color-scheme: light)').matches)
            ? 'light' : 'dark';
  }
  fontSize = read(KEY_FS);
  if (SIZES.indexOf(fontSize) === -1) fontSize = 'normal';

  // CSSより先に属性を付けて、色のちらつきを防ぐ
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-fs', fontSize);

  // 「いまこれが選ばれている」を印で示す（押した結果ではなく現在の状態）
  function mark(selector, attr, current) {
    var btns = document.querySelectorAll(selector);
    for (var i = 0; i < btns.length; i++) {
      var on = (btns[i].getAttribute(attr) === current);
      if (on) { btns[i].classList.add('selected'); }
      else    { btns[i].classList.remove('selected'); }
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function paint() {
    mark('.theme-btn', 'data-theme-set', theme);
    mark('.fs-btn', 'data-fs', fontSize);
  }

  function setTheme(v) {
    if (v !== 'light' && v !== 'dark') return;
    theme = v;
    root.setAttribute('data-theme', theme);
    write(KEY_THEME, theme);
    paint();
  }

  function setFontSize(v) {
    if (SIZES.indexOf(v) === -1) return;
    fontSize = v;
    root.setAttribute('data-fs', fontSize);
    write(KEY_FS, fontSize);
    paint();
  }

  function bind() {
    var tb = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < tb.length; i++) {
      tb[i].addEventListener('click', function () {
        setTheme(this.getAttribute('data-theme-set'));
      });
    }
    var fb = document.querySelectorAll('.fs-btn');
    for (var j = 0; j < fb.length; j++) {
      fb[j].addEventListener('click', function () {
        setFontSize(this.getAttribute('data-fs'));
      });
    }
    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.KaigoTheme = {
    setTheme: setTheme,
    setFontSize: setFontSize,
    get: function () { return { theme: theme, fontSize: fontSize }; }
  };
})();
