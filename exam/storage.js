// storage.js – 学習記録の保存
// app.js より先に読み込むこと

window.KaigoStore = (function () {
  'use strict';

  var KEY_STATE   = 'kaigo_exam_state_v1';   // 問題ごとの最新状態
  var KEY_LOG     = 'kaigo_exam_log_v1';     // 解答履歴（直近1000件）
  var KEY_PREF    = 'kaigo_exam_pref_v1';    // 設定（ふりがな・テーマなど）
  var KEY_SESSION = 'kaigo_exam_session_v1'; // 中断からの復帰用

  var LOG_MAX  = 1000;  // 履歴の上限件数
  var TIME_CAP = 600;   // 1問の記録上限（秒）※放置対策

  /* localStorage が使えるかどうか（プライベートモード対策） */
  var usable = (function () {
    try {
      var t = '__kaigo_test__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  })();

  var memory = {};  // 使えない環境ではメモリ上に保持（タブを閉じると消える）

  function read(key, fallback) {
    try {
      var raw = usable ? window.localStorage.getItem(key) : memory[key];
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    var raw;
    try { raw = JSON.stringify(value); } catch (e) { return false; }

    try {
      if (usable) window.localStorage.setItem(key, raw);
      else memory[key] = raw;
      return true;
    } catch (e) {
      // 容量超過：履歴を半分に減らしてもう一度試す
      try {
        var log = read(KEY_LOG, []);
        if (log.length > 50) {
          log = log.slice(-Math.floor(log.length / 2));
          window.localStorage.setItem(KEY_LOG, JSON.stringify(log));
          window.localStorage.setItem(key, raw);
          return true;
        }
      } catch (e2) {}
      console.warn('学習記録を保存できませんでした', e);
      return false;
    }
  }

  /* 問題を識別するキー（例：37-45） */
  function keyOf(q) {
    if (!q) return '';
    return (q._kai || '0') + '-' + (q.id || '?');
  }

  function clampTime(sec) {
    var n = Number(sec);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(Math.round(n), TIME_CAP);
  }

  /* =====================================================
   *  解答を記録する
   *  info = { key, selected, correct, seconds, subject, part }
   * ===================================================== */
  function recordAnswer(info) {
    if (!info || !info.key) return '';

    var sec    = clampTime(info.seconds);
    var states = read(KEY_STATE, {});
    var s = states[info.key] || {
      n: 0, o: 0, l: 0, c: '', t: 0, d: 0, streak: 0, first: 0, sub: '', p: ''
    };

    s.n += 1;                                   // 挑戦回数
    if (info.correct) { s.o += 1; s.streak += 1; }  // 正解回数・連続正解
    else              { s.streak = 0; }
    s.l = info.correct ? 1 : 0;                 // 直近の正誤
    s.t = sec;                                  // 直近の所要秒数
    s.d = Date.now();                           // 最終解答日時
    s.c = '';                                   // 自信度は解答後に付くのでリセット
    if (!s.first) s.first = Date.now();
    if (info.subject) s.sub = info.subject;
    if (info.part)    s.p   = info.part;

    states[info.key] = s;
    write(KEY_STATE, states);

    var log = read(KEY_LOG, []);
    log.push({
      k: info.key,
      a: info.selected,
      o: info.correct ? 1 : 0,
      t: sec,
      c: '',
      d: Date.now(),
      sub: info.subject || '',
      p: info.part || ''
    });
    if (log.length > LOG_MAX) log = log.slice(log.length - LOG_MAX);
    write(KEY_LOG, log);

    return info.key;
  }

  /* 自信度をあとから付ける（'sure' | 'maybe' | 'guess'） */
  function setConfidence(key, level) {
    if (!key) return;

    var states = read(KEY_STATE, {});
    if (states[key]) {
      states[key].c = level;
      write(KEY_STATE, states);
    }

    var log = read(KEY_LOG, []);
    for (var i = log.length - 1; i >= 0; i--) {
      if (log[i].k === key) { log[i].c = level; break; }
    }
    write(KEY_LOG, log);
  }

  function getState(key) {
    var states = read(KEY_STATE, {});
    return states[key] || null;
  }

  function getAllStates() {
    return read(KEY_STATE, {});
  }

  /* =====================================================
   *  集計
   * ===================================================== */
  function getStats() {
    var states = read(KEY_STATE, {});
    var tried = 0, attempts = 0, correct = 0, timeSum = 0, mastered = 0;

    for (var k in states) {
      if (!states.hasOwnProperty(k)) continue;
      var s = states[k];
      tried++;
      attempts += s.n;
      correct  += s.o;
      timeSum  += s.t;
      if (s.streak >= 2) mastered++;   // 2回続けて正解した問題
    }

    return {
      tried:     tried,                                        // 解いたことのある問題数
      attempts:  attempts,                                     // のべ解答数
      correct:   correct,                                      // のべ正解数
      rate:      attempts ? Math.round(correct / attempts * 100) : 0,
      avgTime:   tried ? Math.round(timeSum / tried) : 0,
      mastered:  mastered
    };
  }

  /* 今日の解答数 */
  function getTodayCount() {
    var log = read(KEY_LOG, []);
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var t = start.getTime();
    var n = 0, c = 0;
    for (var i = log.length - 1; i >= 0; i--) {
      if (log[i].d < t) break;
      n++;
      if (log[i].o) c++;
    }
    return { count: n, correct: c };
  }

  /* 科目別の成績 */
  function getSubjectStats() {
    var states = read(KEY_STATE, {});
    var out = {};
    for (var k in states) {
      if (!states.hasOwnProperty(k)) continue;
      var s = states[k];
      var name = s.sub || '（科目未設定）';
      if (!out[name]) out[name] = { tried: 0, attempts: 0, correct: 0, part: s.p || '' };
      out[name].tried++;
      out[name].attempts += s.n;
      out[name].correct  += s.o;
    }
    for (var m in out) {
      if (!out.hasOwnProperty(m)) continue;
      out[m].rate = out[m].attempts ? Math.round(out[m].correct / out[m].attempts * 100) : 0;
    }
    return out;
  }

  /* =====================================================
   *  復習の優先度
   *  高いほど「もう一度出すべき問題」
   * ===================================================== */
  function priorityOf(s) {
    if (!s || !s.n) return 0;
    var p = 0;

    if (!s.l) p += 100;                        // 直前が不正解
    if (s.l && s.c === 'guess') p += 60;       // 勘で正解＝理解していない
    if (s.l && s.c === 'maybe') p += 25;
    if (!s.l && s.c === 'sure') p += 40;       // 自信ありで不正解＝思い込み

    p += Math.round((1 - (s.o / s.n)) * 50);   // 通算の正答率が低いほど加点

    var days = (Date.now() - (s.d || 0)) / 86400000;
    p += Math.min(Math.round(days), 30);       // 時間が経つほど加点

    if (s.streak >= 3) p -= 60;                // 3回続けて正解なら優先度を下げる

    return p;
  }

  /* 復習すべき問題のキー一覧（優先度の高い順） */
  function getReviewKeys(limit) {
    var states = read(KEY_STATE, {});
    var arr = [];
    for (var k in states) {
      if (!states.hasOwnProperty(k)) continue;
      arr.push({ key: k, p: priorityOf(states[k]) });
    }
    arr.sort(function (a, b) { return b.p - a.p; });
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].p <= 0) break;
      out.push(arr[i].key);
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  /* =====================================================
   *  設定の保存
   * ===================================================== */
  function getPref(name, fallback) {
    var p = read(KEY_PREF, {});
    return (p[name] === undefined) ? fallback : p[name];
  }

  function setPref(name, value) {
    var p = read(KEY_PREF, {});
    p[name] = value;
    write(KEY_PREF, p);
  }

  /* =====================================================
   *  中断からの復帰（次のステップで使用）
   * ===================================================== */
  function saveSession(obj) { write(KEY_SESSION, obj); }
  function loadSession()    { return read(KEY_SESSION, null); }
  function clearSession()   { write(KEY_SESSION, null); }

  /* =====================================================
   *  管理用
   * ===================================================== */
  function exportAll() {
    return {
      state:   read(KEY_STATE, {}),
      log:     read(KEY_LOG, []),
      pref:    read(KEY_PREF, {}),
      version: 1
    };
  }

  function clearAll() {
    write(KEY_STATE, {});
    write(KEY_LOG, []);
    write(KEY_SESSION, null);
  }

  return {
    usable:          usable,
    keyOf:           keyOf,
    recordAnswer:    recordAnswer,
    setConfidence:   setConfidence,
    getState:        getState,
    getAllStates:    getAllStates,
    getStats:        getStats,
    getTodayCount:   getTodayCount,
    getSubjectStats: getSubjectStats,
    getReviewKeys:   getReviewKeys,
    getPref:         getPref,
    setPref:         setPref,
    saveSession:     saveSession,
    loadSession:     loadSession,
    clearSession:    clearSession,
    exportAll:       exportAll,
    clearAll:        clearAll
  };
})();
