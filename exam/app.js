// app.js – 介護福祉士国家試験 過去問アプリ
// 回ごと＝当時の順番 / パート別・科目別＝第38・37・36回を合算してランダム出題

(function () {
  'use strict';

  var Store = window.KaigoStore || null;

  /* =====================================================
   *  設定
   * ===================================================== */
  var KAI_LIST = ['38', '37', '36'];

  var roundFiles = {
    '36': 'data/past_exam_36.json',
    '37': 'data/past_exam_37.json',
    '38': 'data/past_exam_38.json'
  };

  /* =====================================================
   *  状態変数
   * ===================================================== */
  var allData      = {};
  var mergedData   = null;
  var questions    = [];
  var currentIndex = 0;
  var score        = 0;
  var userAnswers  = [];
  var quizMode     = '';
  var furiganaOn   = false;
  var quizLabel    = '';   // 第38回 などの表示名
  var quizSlot     = '';   // 中断セーブの保存先

  // 解説画面に表示中の内容
  var lastResultQ        = null;
  var lastResultSelected = null;
  var lastResultSeconds  = 0;
  var lastAnswerKey      = '';

  // 所要時間の計測
  var questionStartTime = 0;

  /* =====================================================
   *  画面要素
   * ===================================================== */
  var mainMenu        = document.getElementById('mainMenu');
  var partSelectEl    = document.getElementById('partSelect');
  var subjectSelectEl = document.getElementById('subjectSelect');
  var quizScreen      = document.getElementById('quizScreen');
  var resultScreen    = document.getElementById('resultScreen');
  var summaryScreen   = document.getElementById('summaryScreen');
  var subjectListEl   = document.getElementById('subjectList');

  /* =====================================================
   *  ユーティリティ
   * ===================================================== */
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showScreen(screen) {
    [mainMenu, partSelectEl, subjectSelectEl, quizScreen, resultScreen, summaryScreen]
      .forEach(function (el) { if (el) el.classList.add('hidden'); });
    if (screen) screen.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function getCorrectIndex(q) {
    var a   = Number(q.answer);
    var len = (q.choices || []).length;
    if (a >= 1 && a <= len) return a - 1;
    return a;
  }

  function formatSeconds(sec) {
    var s = Math.max(0, Math.round(sec));
    if (s < 60) return s + '秒';
    return Math.floor(s / 60) + '分' + (s % 60) + '秒';
  }

  /* =====================================================
   *  読み込み中の表示
   * ===================================================== */
  var loadingEl = null;

  function showLoading(on) {
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.style.cssText =
        'display:none;position:fixed;inset:0;z-index:9998;background:rgba(15,12,41,.85);' +
        'justify-content:center;align-items:center;color:#fff;font-size:1rem;font-weight:700;';
      loadingEl.textContent = '問題を読み込んでいます…';
      document.body.appendChild(loadingEl);
    }
    loadingEl.style.display = on ? 'flex' : 'none';
  }

  /* =====================================================
   *  JSON 読み込み
   * ===================================================== */
  function loadRound(kai, callback) {
    if (allData[kai]) { callback(allData[kai]); return; }

    var file = roundFiles[kai];
    if (!file) { allData[kai] = []; callback([]); return; }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', file, true);
    xhr.onload = function () {
      var list = [];
      if (xhr.status === 200) {
        try {
          list = JSON.parse(xhr.responseText);
        } catch (e) {
          console.error('JSON parse error: ' + file, e);
          list = [];
        }
      }
      list.forEach(function (q) { q._kai = kai; });
      allData[kai] = list;
      callback(list);
    };
    xhr.onerror = function () {
      allData[kai] = [];
      callback([]);
    };
    xhr.send();
  }

  function loadAllRounds(callback) {
    if (mergedData) { callback(mergedData); return; }

    showLoading(true);
    var remaining = KAI_LIST.length;

    KAI_LIST.forEach(function (k) {
      loadRound(k, function () {
        remaining--;
        if (remaining > 0) return;

        mergedData = [];
        KAI_LIST.forEach(function (kk) {
          mergedData = mergedData.concat(allData[kk] || []);
        });
        showLoading(false);
        callback(mergedData);
      });
    });
  }

  /* =====================================================
   *  ふりがな処理
   * ===================================================== */
  function removeFurigana(text) {
    return String(text)
      .replace(/（[ぁ-ん、\s]+）/g, '')
      .replace(/\([ぁ-ん、\s]+\)/g, '');
  }

  function applyFuriganaToText(text) {
    if (furiganaOn) return String(text);
    return removeFurigana(text);
  }
  /* ふりがなの例外リスト。
     データに読みが書かれていない漢字があると、ルビが手前の漢字まで
     巻き込んで乗ってしまうことがあります。そのときだけここに足します。
     例）「3か月以内（いない）」で 月以内 が拾われてしまう場合
         '月以内': '以内'    ← うしろの「以内」だけにルビを乗せる     */
  var FURI_TAIL = {
  };

  /* 「漢字（かな）」を <ruby> に変える。ふりがなOFFならカッコごと消す。
     「漢字（かな／別名）」は、かなをルビにして「（別名）」を残す。
     ※ 戻り値はHTML。textContent ではなく innerHTML に入れること。 */
  function furiganaHTML(text) {
    var s = String(text == null ? '' : text);
    /* 1つ目=漢字のかたまり / 2つ目=ひらがなの読み / 3つ目=「／ALS」などの補足（無くてもよい） */
    var re = /([\u4E00-\u9FFF\u3005\u3006\u3007]+)[（(]([\u3041-\u309F\u30FC\u3000\s、・･]+)((?:[／\/][^）)]*)?)[）)]/g;
    var out = '', last = 0, m;

    while ((m = re.exec(s)) !== null) {
      out += escapeHTML(s.slice(last, m.index));

      var run  = m[1];
      var kana = m[2].replace(/[\s\u3000、・･]/g, '');
      var note = m[3] ? m[3].replace(/^[／\/]+/, '').trim() : '';

      var tail = FURI_TAIL[run] || run;
      var head = run.slice(0, run.length - tail.length);

      if (furiganaOn && kana) {
        out += escapeHTML(head)
             + '<ruby>' + escapeHTML(tail) + '<rt>' + escapeHTML(kana) + '</rt></ruby>';
      } else {
        out += escapeHTML(run);
      }

      /* 「／ALS」「／QOL」「／機能訓練」などは読みではないので、そのまま見せる */
      if (note) out += '（' + escapeHTML(note) + '）';

      last = m.index + m[0].length;
    }
    out += escapeHTML(s.slice(last));
    return out.replace(/\n/g, '<br>');
  }

  /* =====================================================
   *  事例と問題文の分割
   * ===================================================== */
  function splitCaseAndQuestion(qText) {
    var nlSplit = qText.indexOf('\n\n');
    if (nlSplit !== -1) {
      var casePart = qText.substring(0, nlSplit).trim();
      var askPart  = qText.substring(nlSplit + 2).trim();
      if (casePart && askPart) {
        return { casePart: casePart, askPart: askPart };
      }
    }

    if (
      qText.indexOf('〔事例') === -1 &&
      qText.indexOf('（事例）') === -1 &&
      qText.indexOf('【事例】') === -1 &&
      qText.indexOf('【事例')  === -1
    ) {
      return null;
    }

    var splitPatterns = [
      /(.+(?:である|った|ている|いる|した|ない|ある|れた|てい?た)。\s*)((?:この|その|Ａさん|Ｂさん|Ｃさん|Ｄさん|Ｅさん|Ｆさん|Ｇさん|Ｈさん|Ｊさん|Ｋさん|Ｌさん|Ｍさん|入所|利用|介護|日常|次回).+)$/,
      /(.+(?:である|った|ている|いる|した|ない|ある|れた|てい?た)。\s*)((?:問題\s*\d+|次の|以下の).+)$/
    ];

    for (var i = 0; i < splitPatterns.length; i++) {
      var m = qText.match(splitPatterns[i]);
      if (m) {
        var c = m[1].trim();
        var a = m[2].trim();
        if (c.length > 30 && a.length > 5) {
          return { casePart: c, askPart: a };
        }
      }
    }
    return null;
  }

  function findReferencedCase(q) {
    var stripped = removeFurigana(q.question || '');
    var m = stripped.match(/問題\s*(\d+)\s*と同/);
    if (!m) return null;

    var refId = Number(m[1]);
    var pool  = allData[q._kai] || [];
    for (var i = 0; i < pool.length; i++) {
      if (Number(pool[i].id) === refId) {
        var r = splitCaseAndQuestion(pool[i].question || '');
        return r ? r.casePart : null;
      }
    }
    return null;
  }

  /* =====================================================
   *  画像モーダル
   * ===================================================== */
  var imageModal, modalImg;

  function createImageModal() {
    imageModal = document.createElement('div');
    imageModal.id = 'image-modal';
    imageModal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;'
      + 'background:rgba(0,0,0,0.85);z-index:9999;justify-content:center;align-items:center;cursor:pointer;';
    modalImg = document.createElement('img');
    modalImg.id = 'modal-img';
    modalImg.style.cssText = 'max-width:92%;max-height:92%;border-radius:8px;';
    imageModal.appendChild(modalImg);
    imageModal.addEventListener('click', function () {
      imageModal.style.display = 'none';
    });
    document.body.appendChild(imageModal);
  }

  function openImageModal(src) {
    if (!imageModal) createImageModal();
    modalImg.src = src;
    imageModal.style.display = 'flex';
  }

  /* =====================================================
   *  選択肢の中身を作る（出題画面・解説画面で共用）
   * ===================================================== */
  function appendChoiceContent(el, choiceData, i) {
    var num = document.createElement('span');
    num.className   = 'choice-number';
    num.textContent = (i + 1);
    el.appendChild(num);

    if (typeof choiceData === 'string') {
      var t = document.createElement('span');
      t.className   = 'choice-text';
      t.innerHTML = furiganaHTML(choiceData);
      el.appendChild(t);
      return;
    }

    if (typeof choiceData !== 'object' || choiceData === null) return;

    // 画像だけの選択肢
    if (choiceData.type === 'image' || (choiceData.src && !choiceData.text)) {
      el.classList.add('image-choice');
      var im = document.createElement('img');
      im.src = choiceData.src || choiceData.image;
      im.alt = choiceData.alt || '選択肢' + (i + 1);
      im.style.cssText = 'max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;';
      im.addEventListener('click', function (e) {
        e.stopPropagation();
        openImageModal(this.src);
      });
      el.appendChild(im);
      return;
    }

    // 文字＋画像
    if (choiceData.text) {
      var t2 = document.createElement('span');
      t2.className   = 'choice-text';
      t2.innerHTML = furiganaHTML(choiceData.text);
      el.appendChild(t2);
    }
    if (choiceData.image || choiceData.src) {
      var im2 = document.createElement('img');
      im2.src = choiceData.image || choiceData.src;
      im2.alt = choiceData.text || '選択肢' + (i + 1);
      im2.style.cssText = 'max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;';
      im2.addEventListener('click', function (e) {
        e.stopPropagation();
        openImageModal(this.src);
      });
      el.appendChild(im2);
    }
  }

  /* =====================================================
   *  中断セーブ
   * ===================================================== */
  function allProgress() {
    if (!Store) return {};
    var s = Store.loadSession();
    return (s && typeof s === 'object') ? s : {};
  }

  function saveProgress() {
    if (!Store || !quizSlot || questions.length === 0) return;
    var ids = [];
    for (var i = 0; i < questions.length; i++) ids.push(Store.keyOf(questions[i]));
    var all = allProgress();
    all[quizSlot] = {
      ids: ids, i: currentIndex, score: score,
      mode: quizMode, label: quizLabel, d: Date.now()
    };
    Store.saveSession(all);
  }

  function loadProgress(slot) {
    var p = allProgress()[slot];
    if (!p || !p.ids || !p.ids.length) return null;
    if (p.i <= 0 || p.i >= p.ids.length) return null;
    return p;
  }

  function clearProgress(slot) {
    if (!Store || !slot) return;
    var all = allProgress();
    if (all[slot]) { delete all[slot]; Store.saveSession(all); }
  }

  // 保存した並び順から問題を復元する（データが変わっていたら null）
  function questionsFromIds(ids, pool) {
    var map = {};
    for (var i = 0; i < pool.length; i++) map[Store.keyOf(pool[i])] = pool[i];
    var out = [];
    for (var j = 0; j < ids.length; j++) {
      if (!map[ids[j]]) return null;
      out.push(map[ids[j]]);
    }
    return out;
  }

  // 「続きから / 最初から」を選ぶ画面
  function askResume(info, onResume, onRestart) {
    var pct = info.i ? Math.round(info.score / info.i * 100) : 0;
    var dt  = new Date(info.d);
    var when = (dt.getMonth() + 1) + '月' + dt.getDate() + '日';

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9997;background:rgba(15,12,41,.88);'
      + 'display:flex;justify-content:center;align-items:center;padding:20px;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;border-radius:20px;padding:24px 20px;'
      + 'max-width:360px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.4);';
    box.innerHTML =
      '<div style="font-size:1.05rem;font-weight:800;margin-bottom:12px;">'
        + escapeHTML(info.label) + ' の続きがあります</div>'
      + '<div style="font-size:.92rem;line-height:1.8;margin-bottom:6px;">'
        + info.i + ' / ' + info.ids.length + '問まで進んでいます<br>'
        + 'ここまでの正解 ' + info.score + '問（' + pct + '％）</div>'
      + '<div style="font-size:.75rem;opacity:.55;margin-bottom:18px;">' + when + 'に中断</div>';

    var b1 = document.createElement('button');
    b1.textContent = '▶ ' + (info.i + 1) + '問目から続ける';
    b1.style.cssText = 'width:100%;padding:14px;border:none;border-radius:14px;font-size:1rem;'
      + 'font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:10px;'
      + 'background:linear-gradient(135deg,#00b894,#0984e3);color:#fff;';

    var b2 = document.createElement('button');
    b2.textContent = '🔄 最初からやり直す';
    b2.style.cssText = 'width:100%;padding:12px;border:2px solid #ddd;border-radius:14px;'
      + 'font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit;background:#fff;color:#666;';

    box.appendChild(b1);
    box.appendChild(b2);
    ov.appendChild(box);
    document.body.appendChild(ov);

    function close() { if (ov.parentNode) document.body.removeChild(ov); }
    b1.addEventListener('click', function () { close(); onResume(); });
    b2.addEventListener('click', function () {
      if (!confirm('ここまでの続き（' + info.i + '問目まで）は消えます。よろしいですか？')) return;
      close(); onRestart();
    });
  }

  // 「何問やりますか？」を選ぶ画面
  function askCount(label, total, onPick) {
    var opts = [];
    if (total > 10) opts.push({ n: 10, t: '☕ 10問（約5分）',  s: '5分だけならやれる' });
    if (total > 20) opts.push({ n: 20, t: '📖 20問（約15分）', s: 'ちょっと今日はやるか' });
    opts.push({ n: total, t: '🌙 全' + total + '問', s: '今日はとことんやる！' });

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9997;background:rgba(15,12,41,.88);'
      + 'display:flex;justify-content:center;align-items:center;padding:20px;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;border-radius:20px;padding:24px 20px;'
      + 'max-width:360px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.4);';
    box.innerHTML =
      '<div style="font-size:1.05rem;font-weight:800;margin-bottom:4px;">'
        + escapeHTML(label) + '</div>'
      + '<div style="font-size:.85rem;opacity:.6;margin-bottom:18px;">'
        + '何問やりますか？（全' + total + '問からランダム）</div>';

    function close() { if (ov.parentNode) document.body.removeChild(ov); }

    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.style.cssText = 'width:100%;padding:13px;border:none;border-radius:14px;'
        + 'font-family:inherit;cursor:pointer;margin-bottom:10px;color:#fff;'
        + 'background:linear-gradient(135deg,#00b894,#0984e3);';
      b.innerHTML = '<div style="font-size:1rem;font-weight:700;">' + o.t + '</div>'
        + '<div style="font-size:.72rem;opacity:.85;margin-top:2px;">' + o.s + '</div>';
      b.addEventListener('click', function () { close(); onPick(o.n); });
      box.appendChild(b);
    });

    var back = document.createElement('button');
    back.textContent = '← 選びなおす';
    back.style.cssText = 'width:100%;padding:11px;border:2px solid #ddd;border-radius:14px;'
      + 'font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit;background:#fff;color:#666;';
    back.addEventListener('click', close);
    box.appendChild(back);

    ov.appendChild(box);
    document.body.appendChild(ov);
  }

  // ランダム出題の共通の入り口（中断の続き → 問数選択）
  function beginRandom(pool, mode, label, slot) {
    var saved   = loadProgress(slot);
    var revived = saved ? questionsFromIds(saved.ids, pool) : null;

    if (saved && revived) {
      askResume(saved,
        function () { startQuiz(revived, mode, label, slot, saved); },
        function () {
          clearProgress(slot);
          askCount(label, pool.length, function (n) {
            startQuiz(shuffleArray(pool).slice(0, n), mode, label, slot, null);
          });
        });
      return;
    }

    clearProgress(slot);
    askCount(label, pool.length, function (n) {
      startQuiz(shuffleArray(pool).slice(0, n), mode, label, slot, null);
    });
  }

  /* =====================================================
   *  復習モード
   * ===================================================== */
  function updateReviewMenu() {
    var sub = document.getElementById('reviewMenuSub');
    if (!sub || !Store) return;
    var n = Store.getReviewKeys(0).length;
    sub.textContent = n === 0
      ? 'まだ復習する問題はありません（問題を解くとたまります）'
      : '復習したい問題が ' + n + '問 たまっています';
  }

  window.startReview = function () {
    if (!Store) { alert('この環境では学習記録を使えません。'); return; }

    var keys = Store.getReviewKeys(0);
    if (keys.length === 0) {
      alert('まだ復習する問題がありません。\n\nまず過去問を解いてみてください。まちがえた問題や、自信がなかった問題がここにたまります。');
      return;
    }

    loadAllRounds(function (data) {
      var map = {};
      for (var i = 0; i < data.length; i++) map[Store.keyOf(data[i])] = data[i];

      var pool = [];
      for (var j = 0; j < keys.length; j++) {
        if (map[keys[j]]) pool.push(map[keys[j]]);   // 優先度の高い順のまま
      }
      if (pool.length === 0) {
        alert('復習する問題を見つけられませんでした。');
        return;
      }

      var slot  = 'review';
      var label = '復習モード';
      var saved   = loadProgress(slot);
      var revived = saved ? questionsFromIds(saved.ids, data) : null;

      if (saved && revived) {
        askResume(saved,
          function () { startQuiz(revived, 'review', label, slot, saved); },
          function () {
            clearProgress(slot);
            askCount(label, pool.length, function (n) {
              startQuiz(pool.slice(0, n), 'review', label, slot, null);
            });
          });
        return;
      }

      clearProgress(slot);
      askCount(label, pool.length, function (n) {
        startQuiz(pool.slice(0, n), 'review', label, slot, null);   // 苦手な順に出す
      });
    });
  };

  /* =====================================================
   *  出題開始
   * ===================================================== */
  function startQuiz(list, mode, label, slot, resume) {
    questions    = list;
    currentIndex = resume ? resume.i : 0;
    score        = resume ? resume.score : 0;
    userAnswers  = [];
    quizMode     = mode;
    quizLabel    = label || '';
    quizSlot     = slot || '';
    lastResultQ        = null;
    lastResultSelected = null;
    lastAnswerKey      = '';
    saveProgress();
    showScreen(quizScreen);
    renderQuestion();
  }

  window.startExamByKai = function (kai) {
    var slot  = 'kai' + kai;
    var label = '第' + kai + '回';
    showLoading(true);
    loadRound(kai, function (data) {
      showLoading(false);
      if (!data || data.length === 0) {
        alert('データの読み込みに失敗しました。');
        return;
      }
      var saved   = loadProgress(slot);
      var revived = saved ? questionsFromIds(saved.ids, data) : null;

      if (saved && revived) {
        askResume(saved,
          function () { startQuiz(revived, 'kai', label, slot, saved); },
          function () { clearProgress(slot); startQuiz(data.slice(), 'kai', label, slot, null); });
      } else {
        clearProgress(slot);
        startQuiz(data.slice(), 'kai', label, slot, null);
      }
    });
  };

  /* =====================================================
   *  パート別
   * ===================================================== */
  window.showPartSelect = function () {
    showScreen(partSelectEl);
    var title = document.getElementById('partSelectTitle');
    if (title) title.textContent = 'パートを選んでください（読み込み中…）';

    loadAllRounds(function (data) {
      var c = { 'パートA': 0, 'パートB': 0, 'パートC': 0 };
      data.forEach(function (q) { if (c[q.part] !== undefined) c[q.part]++; });
      if (title) {
        title.textContent = '第38・37・36回から出題　A ' + c['パートA']
          + '問 ／ B ' + c['パートB'] + '問 ／ C ' + c['パートC'] + '問';
      }
    });
  };

  window.startByPart = function (part) {
    loadAllRounds(function (data) {
      var filtered = data.filter(function (q) { return q.part === part; });
      if (filtered.length === 0) {
        alert('該当する問題がありません。');
        return;
      }
      beginRandom(filtered, 'part', part, 'part-' + part);
    });
  };

  /* =====================================================
   *  科目別
   * ===================================================== */
  window.showSubjectSelect = function () {
    showScreen(subjectSelectEl);

    var title = document.getElementById('subjectSelectTitle');
    if (title) title.textContent = '科目を選んでください（第38・37・36回から出題）';

    subjectListEl.innerHTML = '<li style="list-style:none;opacity:.6;padding:12px;">読み込み中…</li>';

    loadAllRounds(function (data) {
      subjectListEl.innerHTML = '';

      if (!data || data.length === 0) {
        subjectListEl.innerHTML =
          '<li style="list-style:none;opacity:.6;padding:12px;">データを読み込めませんでした。</li>';
        return;
      }

      var order = [];
      var info  = {};
      data.forEach(function (q) {
        var raw = q.subject || '（科目未設定）';
        var key = removeFurigana(raw).replace(/\s/g, '');
        if (!info[key]) {
          info[key] = { count: 0, part: q.part || '', label: raw, names: [] };
          order.push(key);
        }
        info[key].count++;
        if (info[key].names.indexOf(raw) === -1) info[key].names.push(raw);
        if (raw.length > info[key].label.length) info[key].label = raw;
      });

      var rank = { 'パートA': 1, 'パートB': 2, 'パートC': 3 };
      order.sort(function (x, y) {
        return (rank[info[x].part] || 9) - (rank[info[y].part] || 9);
      });

      order.forEach(function (key) {
        var item = info[key];
        var li   = document.createElement('li');
        var btn  = document.createElement('button');
        btn.className = 'subject-item';

        var badge = document.createElement('span');
        badge.className   = 'subject-badge';
        badge.textContent = item.part.slice(-1) || '−';
        btn.appendChild(badge);

        var name = document.createElement('span');
        name.className   = 'subject-name';
        name.innerHTML = furiganaHTML(item.label);
        btn.appendChild(name);

        var count = document.createElement('span');
        count.className   = 'subject-count';
        count.textContent = item.count + '問';
        btn.appendChild(count);

        btn.addEventListener('click', function () {
          startBySubjectNames(item.names, removeFurigana(item.label));
        });

        li.appendChild(btn);
        subjectListEl.appendChild(li);
      });
    });
  };

  function startBySubjectNames(names, label) {
    loadAllRounds(function (data) {
      var filtered = data.filter(function (q) {
        return names.indexOf(q.subject) !== -1;
      });
      if (filtered.length === 0) {
        alert('該当する問題がありません。');
        return;
      }
      var nm = label || names[0] || '';
      beginRandom(filtered, 'subject', nm, 'subject-' + nm);
    });
  }

  window.switchKai = function (kai) {
    ['38', '37', '36'].forEach(function (k) {
      var btn = document.getElementById('kaiBtn' + k);
      if (btn) btn.classList.toggle('active', k === kai);
    });
  };

  /* =====================================================
   *  戻る系
   * ===================================================== */
  window.backToMain = function () { updateReviewMenu(); showScreen(mainMenu); };

  window.backToMainFromSummary = function () { updateReviewMenu(); showScreen(mainMenu); };

  function showInterimSummary(done) {
    var pct = done ? Math.round(score / done * 100) : 0;
    var e = document.getElementById('summaryEmoji');
    var s = document.getElementById('summaryScore');
    var t = document.getElementById('summaryTotal');
    var b = document.getElementById('summaryBarFill');
    var m = document.getElementById('summaryMessage');
    if (e) e.textContent = '💾';
    if (s) s.textContent = score;
    if (t) t.textContent = '/ ' + done + '問中（正答率 ' + pct + '％）';
    if (b) b.style.width = pct + '%';
    if (m) {
      m.textContent = quizSlot
        ? 'ここまでの記録を保存しました。次は' + (done + 1) + '問目から続けられます。'
        : 'ここまでの結果です。おつかれさまでした。';
    }
    showScreen(summaryScreen);
  }

  window.quitQuiz = function () {
    var done = currentIndex;
    if (done === 0) { clearProgress(quizSlot); updateReviewMenu(); showScreen(mainMenu); return; }
    saveProgress();
    showInterimSummary(done);
  };

  /* =====================================================
   *  問題描画
   * ===================================================== */
  function renderQuestion() {
    var q = questions[currentIndex];
    if (!q) return;

    var progressText = document.getElementById('quizProgressText');
    var progressFill = document.getElementById('quizProgressFill');
    var quizNumber   = document.getElementById('quizNumber');
    var quizSubject  = document.getElementById('quizSubject');
    var questionEl   = document.getElementById('quizQuestion');
    var choicesEl    = document.getElementById('choicesList');

    if (progressText) progressText.textContent = (currentIndex + 1) + ' / ' + questions.length;
    if (progressFill) progressFill.style.width = ((currentIndex + 1) / questions.length * 100) + '%';

    if (quizNumber) {
      var label = '問' + (q.id || (currentIndex + 1));
      if (q._kai) label = '第' + q._kai + '回 ' + label;
      quizNumber.textContent = label;
    }

    if (quizSubject) quizSubject.innerHTML = furiganaHTML(q.subject || '');

    /* ---------- 問題文 ---------- */
    /* 事例の切り分けは、ふりがなカッコが付いたままの文で行います。
       ルビのHTMLを作ってから切ると、正規表現がタグでこわれるためです。
       切り分けたあとで、それぞれをルビに変えます。 */
    var rawText = String(q.question || '');
    var result  = splitCaseAndQuestion(rawText);

    var refCase = findReferencedCase(q);
    if (refCase) {
      var askRaw = result ? result.askPart : rawText;
      result = { casePart: refCase, askPart: askRaw };
    }

    var html = '';
    if (result) {
      html += '<div class="question-case">' + furiganaHTML(result.casePart) + '</div>';
      html += '<div class="question-ask">'  + furiganaHTML(result.askPart)  + '</div>';
    } else {
      html += '<div>' + furiganaHTML(rawText) + '</div>';
    }

    if (q.question_image) {
      html += '<div class="question-image-wrap">'
            + '<img src="' + escapeHTML(q.question_image) + '" alt="問題画像" class="question-image" style="cursor:pointer;" />'
            + '</div>';
    }

    questionEl.innerHTML = html;

    var qImg = questionEl.querySelector('.question-image');
    if (qImg) {
      qImg.addEventListener('click', function () { openImageModal(this.src); });
    }

    /* ---------- 選択肢 ---------- */
    choicesEl.innerHTML = '';
    var choices = q.choices || [];

    choices.forEach(function (choiceData, i) {
      var li  = document.createElement('li');
      var btn = document.createElement('button');
      btn.className = 'choice-button';

      appendChoiceContent(btn, choiceData, i);

      btn.addEventListener('click', function () {
        handleAnswer(q, i);
      });

      li.appendChild(btn);
      choicesEl.appendChild(li);
    });

    // 所要時間の計測を開始
    questionStartTime = Date.now();
  }

  /* =====================================================
   *  解答したとき
   * ===================================================== */
  function handleAnswer(q, i) {
    var sec = questionStartTime ? (Date.now() - questionStartTime) / 1000 : 0;
    var isCorrect = (i === getCorrectIndex(q));

    userAnswers[currentIndex] = i;
    if (isCorrect) score++;

    lastResultSeconds = Math.round(sec);
    lastAnswerKey     = '';

    if (Store) {
      lastAnswerKey = Store.recordAnswer({
        key:      Store.keyOf(q),
        selected: i,
        correct:  isCorrect,
        seconds:  sec,
        subject:  removeFurigana(q.subject || ''),
        part:     q.part || ''
      });
    }

    showResult(q, i);
  }

  /* =====================================================
   *  自信度ボタン
   * ===================================================== */
  var confidenceBox = document.getElementById('confidenceBox');

  function setupConfidenceButtons() {
    if (!confidenceBox) return;
    var btns = confidenceBox.querySelectorAll('.confidence-btn');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () {
        var level = b.getAttribute('data-level');
        if (Store && lastAnswerKey) Store.setConfidence(lastAnswerKey, level);
        paintConfidence(level);
      });
    });
  }

  function paintConfidence(level) {
    if (!confidenceBox) return;
    var btns = confidenceBox.querySelectorAll('.confidence-btn');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('selected', b.getAttribute('data-level') === level);
    });
  }

  /* =====================================================
   *  解説画面：選択肢の再掲
   * ===================================================== */
  function paintReviewChoices(q, selected) {
    var listEl = document.getElementById('reviewChoices');
    if (!listEl) return;

    listEl.innerHTML = '';
    var choices = q.choices || [];
    var correct = getCorrectIndex(q);

    choices.forEach(function (choiceData, i) {
      var li   = document.createElement('li');
      var item = document.createElement('div');
      item.className = 'review-item';

      var tags = [];
      if (i === correct)  { item.classList.add('is-correct'); tags.push('⭕ 正解'); }
      if (i === selected) {
        item.classList.add('is-picked');
        tags.push(i === correct ? '✔ あなたの答え' : '❌ あなたの答え');
      }

      if (tags.length) {
        var tag = document.createElement('span');
        tag.className   = 'review-tag';
        tag.textContent = tags.join('　');
        item.appendChild(tag);
      }

      var body = document.createElement('div');
      body.className = 'review-body';
      appendChoiceContent(body, choiceData, i);
      item.appendChild(body);

      li.appendChild(item);
      listEl.appendChild(li);
    });
  }

  /* =====================================================
   *  正誤画面
   * ===================================================== */
  function paintResult(q, selected) {
    if (!q) return;

    lastResultQ        = q;
    lastResultSelected = selected;

    var correct   = getCorrectIndex(q);
    var isCorrect = (selected === correct);

    var resultIcon        = document.getElementById('resultIcon');
    var resultText        = document.getElementById('resultText');
    var resultTime        = document.getElementById('resultTime');
    var resultAnswer      = document.getElementById('resultAnswer');
    var resultExplanation = document.getElementById('resultExplanation');
    var nextButton        = document.getElementById('nextButton');

    if (resultIcon) resultIcon.textContent = isCorrect ? '⭕' : '❌';

    if (resultText) {
      resultText.textContent = isCorrect ? '正解！' : '不正解…';
      resultText.classList.remove('correct', 'incorrect');
      resultText.classList.add(isCorrect ? 'correct' : 'incorrect');
    }

    if (resultTime) {
      var msg = 'かかった時間　' + formatSeconds(lastResultSeconds);
      if (Store && lastAnswerKey) {
        var st = Store.getState(lastAnswerKey);
        if (st && st.n > 1) {
          msg += '　／　この問題は' + st.n + '回目（正解' + st.o + '回）';
        }
      }
      resultTime.textContent = msg;
    }

    if (resultAnswer) resultAnswer.textContent = (correct + 1);

    if (resultExplanation) {
      if (q.explanation) {
        resultExplanation.innerHTML = furiganaHTML(q.explanation);
      } else {
        resultExplanation.textContent = '解説はありません。';
      }
    }

    if (nextButton) {
      nextButton.textContent = (currentIndex >= questions.length - 1)
        ? '結果を見る 📊'
        : '次へ ▶';
    }

    paintReviewChoices(q, selected);
  }

  function showResult(q, selected) {
    paintResult(q, selected);
    paintConfidence('');   // 前の問題の選択を消す
    showScreen(resultScreen);
  }

  /* =====================================================
   *  次の問題 / 結果
   * ===================================================== */
  window.nextQuestion = function () {
    currentIndex++;
    if (currentIndex >= questions.length) {
      clearProgress(quizSlot);
      showSummary();
    } else {
      lastResultQ        = null;
      lastResultSelected = null;
      lastAnswerKey      = '';
      saveProgress();
      showScreen(quizScreen);
      renderQuestion();
    }
  };

  function showSummary() {
    var summaryEmoji   = document.getElementById('summaryEmoji');
    var summaryScore   = document.getElementById('summaryScore');
    var summaryTotal   = document.getElementById('summaryTotal');
    var summaryBarFill = document.getElementById('summaryBarFill');
    var summaryMessage = document.getElementById('summaryMessage');

    var pct = Math.round(score / questions.length * 100);

    if (summaryScore)   summaryScore.textContent   = score;
    if (summaryTotal)   summaryTotal.textContent   = '/ ' + questions.length + '問中（正答率 ' + pct + '％）';
    if (summaryBarFill) summaryBarFill.style.width = pct + '%';

    var emoji = '📖';
    var msg   = '復習して再挑戦しましょう！';
    if (pct >= 90)      { emoji = '🏆'; msg = '素晴らしい！安定した合格レベルです！'; }
    else if (pct >= 70) { emoji = '🎉'; msg = 'よくできました！この調子です！'; }
    else if (pct >= 60) { emoji = '👍'; msg = '合格ラインの目安（6割）に届きました！'; }
    else if (pct >= 40) { emoji = '💪'; msg = 'あと少しで6割です。間違えた科目を重点的に！'; }

    if (summaryEmoji)   summaryEmoji.textContent   = emoji;
    if (summaryMessage) summaryMessage.textContent = msg;

    showScreen(summaryScreen);
  }

  window.retryQuiz = function () {
    currentIndex = 0;
    score        = 0;
    userAnswers  = [];
    lastResultQ        = null;
    lastResultSelected = null;
    lastAnswerKey      = '';
    if (quizMode !== 'kai') questions = shuffleArray(questions);
    saveProgress();
    showScreen(quizScreen);
    renderQuestion();
  };

  /* =====================================================
   *  ふりがな切り替え
   * ===================================================== */
  function paintFuriganaSwitch() {
    var status = document.getElementById('furiganaStatus');
    var track  = document.getElementById('furiganaTrack');

    if (status) {
      status.textContent = furiganaOn ? 'ON' : 'OFF';
      status.classList.toggle('active', furiganaOn);
    }
    if (track) track.classList.toggle('active', furiganaOn);
  }

  window.toggleFurigana = function () {
    furiganaOn = !furiganaOn;
    paintFuriganaSwitch();
    if (Store) Store.setPref('furigana', furiganaOn);

    if (questions.length > 0) renderQuestion();
    if (lastResultQ) paintResult(lastResultQ, lastResultSelected);

    if (subjectSelectEl && !subjectSelectEl.classList.contains('hidden')) {
      window.showSubjectSelect();
    }
  };

  /* =====================================================
   *  わからない言葉をなぞって質問（土台）
   * ===================================================== */
  var askChip  = null;
  var askWord  = '';
  var askTimer = null;

  function hideAskChip() {
    if (askChip) askChip.style.display = 'none';
    askWord = '';
  }

  function isInsideAskable(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentNode);
    var ok = ['quiz-question', 'choices-list', 'result-explanation', 'review-list'];
    while (el && el !== document.body) {
      if (el.classList) {
        for (var i = 0; i < ok.length; i++) {
          if (el.classList.contains(ok[i])) return true;
        }
      }
      el = el.parentNode;
    }
    return false;
  }

  function ensureAskChip() {
    if (askChip) return askChip;
    askChip = document.createElement('button');
    askChip.type      = 'button';
    askChip.id        = 'askChip';
    askChip.className = 'ask-chip';
    askChip.addEventListener('click', function (e) {
      e.preventDefault();
      var w = askWord;
      var q = lastResultQ || questions[currentIndex] || null;
      hideAskChip();
      if (typeof window.KaigoAskWord === 'function') {
        window.KaigoAskWord(w, q);
      } else {
        alert('「' + w + '」\n\n質問の送信先はまだ設定されていません。');
      }
    });
    document.body.appendChild(askChip);
    return askChip;
  }

  function handleSelection() {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideAskChip(); return; }

    var text = String(sel.toString()).replace(/\s+/g, ' ').trim();
    if (text.length < 1 || text.length > 30) { hideAskChip(); return; }
    if (!isInsideAskable(sel.anchorNode))    { hideAskChip(); return; }

    var rect = sel.getRangeAt(0).getBoundingClientRect();
    var chip = ensureAskChip();
    askWord = text;
    chip.textContent = '「' + (text.length > 10 ? text.slice(0, 10) + '…' : text) + '」を質問';

    /* 大きく、はっきり出す */
    chip.style.display      = 'block';
    chip.style.position     = 'fixed';
    chip.style.zIndex       = '9996';
    chip.style.fontSize     = '1.08rem';
    chip.style.fontWeight   = '800';
    chip.style.padding      = '15px 26px';
    chip.style.borderRadius = '26px';
    chip.style.boxShadow    = '0 8px 28px rgba(0,0,0,.45)';

    /* iPhone標準の「コピー／調べる／翻訳」は、なぞった場所のすぐ近くに出る。
       なぞった場所が画面の下半分なら上へ、上半分なら下へ逃がす。
       100vh ではなく実際の表示の高さから計算する（iOSでずれるため）。 */
    var vh = window.innerHeight;
    var selMiddle = (rect.top + rect.bottom) / 2;
    if (selMiddle > vh / 2) {
      chip.style.bottom = 'auto';
      chip.style.top    = Math.round(vh * 0.20) + 'px';
    } else {
      chip.style.top    = 'auto';
      chip.style.bottom = Math.round(vh * 0.26) + 'px';
    }

    var w = chip.offsetWidth || 200;
    var left = (window.innerWidth - w) / 2;
    if (left < 8) left = 8;
    chip.style.left = Math.round(left) + 'px';
  }

  document.addEventListener('selectionchange', function () {
    clearTimeout(askTimer);
    askTimer = setTimeout(handleSelection, 250);
  });

  /* =====================================================
   *  初期化
   * ===================================================== */
  createImageModal();
  setupConfidenceButtons();
  updateReviewMenu();

  if (Store) {
    furiganaOn = !!Store.getPref('furigana', false);
    paintFuriganaSwitch();
    if (!Store.usable) {
      console.warn('この環境では学習記録を保存できません（プライベートモードの可能性）');
    }
  }

})();
