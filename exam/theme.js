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

  function paint() {
    var t = document.getElementById('themeToggle');
    if (t) {
      t.textContent = (theme === 'light') ? '🌙 ダーク' : '☀️ ライト';
      t.setAttribute('aria-label',
        (theme === 'light') ? 'ダークモードに切り替える' : 'ライトモードに切り替える');
    }
    var btns = document.querySelectorAll('.fs-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = (btns[i].getAttribute('data-fs') === fontSize);
      if (on) { btns[i].classList.add('selected'); }
      else    { btns[i].classList.remove('selected'); }
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function setTheme(v) {
    theme = (v === 'light') ? 'light' : 'dark';
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
    var t = document.getElementById('themeToggle');
    if (t) {
      t.addEventListener('click', function () {
        setTheme(theme === 'light' ? 'dark' : 'light');
      });
    }
    var btns = document.querySelectorAll('.fs-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
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
