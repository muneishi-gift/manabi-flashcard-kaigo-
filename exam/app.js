// app.js – 介護福祉士国家試験 過去問アプリ
// 回ごと＝当時の順番 / パート別・科目別＝第38・37・36回を合算してランダム出題

(function () {
  'use strict';

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
  var allData      = {};    // { '38': [...], '37': [...], '36': [...] }
  var mergedData   = null;  // 3回分を結合した配列
  var questions    = [];
  var currentIndex = 0;
  var score        = 0;
  var userAnswers  = [];
  var quizMode     = '';    // 'kai' | 'part' | 'subject'
  var furiganaOn   = false;

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

  /* 正解番号：JSONは1始まり。0始まりが混ざっても壊れないようにする */
  function getCorrectIndex(q) {
    var a   = Number(q.answer);
    var len = (q.choices || []).length;
    if (a >= 1 && a <= len) return a - 1;
    return a;
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
      // どの回の問題かを各問題に記録する
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

  /* 3回分すべてを読み込んで1つに結合する */
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

        // 振り分け確認用（F12のConsoleに表示されます）
        var pc = {};
        mergedData.forEach(function (q) {
          var key = (q._kai || '?') + '-' + (q.part || '未設定');
          pc[key] = (pc[key] || 0) + 1;
        });
        console.log('パート別問題数', pc, '合計', mergedData.length);

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

  /* 「〔事例は問題114と同じ〕」の場合、同じ回の問114から事例本文を取ってくる */
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
   *  出題開始の共通処理
   * ===================================================== */
  function startQuiz(list, mode) {
    questions    = list;
    currentIndex = 0;
    score        = 0;
    userAnswers  = [];
    quizMode     = mode;
    showScreen(quizScreen);
    renderQuestion();
  }

  /* =====================================================
   *  回ごとに挑戦（当時の順番のまま）
   * ===================================================== */
  window.startExamByKai = function (kai) {
    showLoading(true);
    loadRound(kai, function (data) {
      showLoading(false);
      if (!data || data.length === 0) {
        alert('データの読み込みに失敗しました。');
        return;
      }
      startQuiz(data.slice(), 'kai');
    });
  };

  /* =====================================================
   *  パート別（3回分を合算してランダム）
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
      startQuiz(shuffleArray(filtered), 'part');
    });
  };

  /* =====================================================
   *  科目別（3回分を合算してランダム）
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

      // ふりがなの表記ゆれを吸収して集計する
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
        // ふりがな付きの長い表記を見出しに採用する
        if (raw.length > info[key].label.length) info[key].label = raw;
      });

      // パートA → B → C の順に並べ替える
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
        name.textContent = applyFuriganaToText(item.label);
        btn.appendChild(name);

        var count = document.createElement('span');
        count.className   = 'subject-count';
        count.textContent = item.count + '問';
        btn.appendChild(count);

        btn.addEventListener('click', function () {
          startBySubjectNames(item.names);
        });

        li.appendChild(btn);
        subjectListEl.appendChild(li);
      });
    });
  };

  function startBySubjectNames(names) {
    loadAllRounds(function (data) {
      var filtered = data.filter(function (q) {
        return names.indexOf(q.subject) !== -1;
      });
      if (filtered.length === 0) {
        alert('該当する問題がありません。');
        return;
      }
      startQuiz(shuffleArray(filtered), 'subject');
    });
  }

  /* 旧HTMLの回切り替えボタンが残っていてもエラーにならないようにする */
  window.switchKai = function (kai) {
    ['38', '37', '36'].forEach(function (k) {
      var btn = document.getElementById('kaiBtn' + k);
      if (btn) btn.classList.toggle('active', k === kai);
    });
  };

  /* =====================================================
   *  戻る系
   * ===================================================== */
  window.backToMain = function () { showScreen(mainMenu); };

  window.backToMainFromSummary = function () { showScreen(mainMenu); };

  window.quitQuiz = function () {
    if (confirm('メニューに戻りますか？')) showScreen(mainMenu);
  };

  /* =====================================================
   *  問題描画
   * ===================================================== */
  function renderQuestion() {
    var q = questions[currentIndex];

    var progressText = document.getElementById('quizProgressText');
    var progressFill = document.getElementById('quizProgressFill');
    var quizNumber   = document.getElementById('quizNumber');
    var quizSubject  = document.getElementById('quizSubject');
    var questionEl   = document.getElementById('quizQuestion');
    var choicesEl    = document.getElementById('choicesList');

    if (progressText) progressText.textContent = (currentIndex + 1) + ' / ' + questions.length;
    if (progressFill) progressFill.style.width = ((currentIndex + 1) / questions.length * 100) + '%';

    // 混ざって出題されるので、どの回の何問目かを表示する
    if (quizNumber) {
      var label = '問' + (q.id || (currentIndex + 1));
      if (q._kai) label = '第' + q._kai + '回 ' + label;
      quizNumber.textContent = label;
    }

    if (quizSubject) quizSubject.textContent = applyFuriganaToText(q.subject || '');

    /* ---------- 問題文 ---------- */
    var displayText = applyFuriganaToText(q.question || '');
    var result = splitCaseAndQuestion(displayText);

    // 「事例は問題◯◯と同じ」なら、その事例本文を補って表示する
    var refCase = findReferencedCase(q);
    if (refCase) {
      var askText = result ? result.askPart : displayText;
      result = { casePart: applyFuriganaToText(refCase), askPart: askText };
    }

    var html = '';
    if (result) {
      html += '<div class="question-case">' + escapeHTML(result.casePart) + '</div>';
      html += '<div class="question-ask">'  + escapeHTML(result.askPart)  + '</div>';
    } else {
      html += '<div>' + escapeHTML(displayText) + '</div>';
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

      /* パターン1: 文字列 */
      if (typeof choiceData === 'string') {
        var label1 = document.createElement('span');
        label1.className   = 'choice-number';
        label1.textContent = (i + 1);
        btn.appendChild(label1);

        var text1 = document.createElement('span');
        text1.className   = 'choice-text';
        text1.textContent = applyFuriganaToText(choiceData);
        btn.appendChild(text1);
      }

      /* パターン2: { type: "image", src, alt } */
      else if (typeof choiceData === 'object' && choiceData !== null && choiceData.type === 'image') {
        btn.classList.add('image-choice');

        var label2 = document.createElement('span');
        label2.className   = 'choice-number';
        label2.textContent = (i + 1);
        btn.appendChild(label2);

        var img2 = document.createElement('img');
        img2.src = choiceData.src;
        img2.alt = choiceData.alt || '選択肢' + (i + 1);
        img2.style.cssText = 'max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;';
        img2.addEventListener('click', function (e) {
          e.stopPropagation();
          openImageModal(this.src);
        });
        btn.appendChild(img2);
      }

      /* パターン3: { text, image } */
      else if (typeof choiceData === 'object' && choiceData !== null) {
        var label3 = document.createElement('span');
        label3.className   = 'choice-number';
        label3.textContent = (i + 1);
        btn.appendChild(label3);

        if (choiceData.text) {
          var text3 = document.createElement('span');
          text3.className   = 'choice-text';
          text3.textContent = applyFuriganaToText(choiceData.text);
          btn.appendChild(text3);
        }
        if (choiceData.image) {
          var img3 = document.createElement('img');
          img3.src = choiceData.image;
          img3.alt = choiceData.text || '選択肢' + (i + 1);
          img3.style.cssText = 'max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;';
          img3.addEventListener('click', function (e) {
            e.stopPropagation();
            openImageModal(this.src);
          });
          btn.appendChild(img3);
        }
      }

      btn.addEventListener('click', function () {
        userAnswers[currentIndex] = i;
        if (i === getCorrectIndex(q)) score++;
        showResult(q, i);
      });

      li.appendChild(btn);
      choicesEl.appendChild(li);
    });
  }

  /* =====================================================
   *  正誤画面
   * ===================================================== */
  function showResult(q, selected) {
    var correct   = getCorrectIndex(q);
    var isCorrect = (selected === correct);

    var resultIcon        = document.getElementById('resultIcon');
    var resultText        = document.getElementById('resultText');
    var resultAnswer      = document.getElementById('resultAnswer');
    var resultExplanation = document.getElementById('resultExplanation');
    var nextButton        = document.getElementById('nextButton');

    if (resultIcon) resultIcon.textContent = isCorrect ? '⭕' : '❌';

    if (resultText) {
      resultText.textContent = isCorrect ? '正解！' : '不正解…';
      resultText.classList.remove('correct', 'incorrect');
      resultText.classList.add(isCorrect ? 'correct' : 'incorrect');
    }

    if (resultAnswer) resultAnswer.textContent = (correct + 1);

    if (resultExplanation) {
      resultExplanation.textContent = q.explanation
        ? applyFuriganaToText(q.explanation)
        : '解説はありません。';
    }

    if (nextButton) {
      nextButton.textContent = (currentIndex >= questions.length - 1)
        ? '結果を見る 📊'
        : '次へ ▶';
    }

    showScreen(resultScreen);
  }

  /* =====================================================
   *  次の問題 / 結果
   * ===================================================== */
  window.nextQuestion = function () {
    currentIndex++;
    if (currentIndex >= questions.length) {
      showSummary();
    } else {
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
    if (quizMode !== 'kai') questions = shuffleArray(questions);
    showScreen(quizScreen);
    renderQuestion();
  };

  /* =====================================================
   *  ふりがな切り替え
   * ===================================================== */
  window.toggleFurigana = function () {
    furiganaOn = !furiganaOn;

    var status = document.getElementById('furiganaStatus');
    var track  = document.getElementById('furiganaTrack');

    if (status) {
      status.textContent = furiganaOn ? 'ON' : 'OFF';
      status.classList.toggle('active', furiganaOn);
    }
    if (track) track.classList.toggle('active', furiganaOn);

    if (quizScreen && !quizScreen.classList.contains('hidden') && questions.length > 0) {
      renderQuestion();
    }
    if (subjectSelectEl && !subjectSelectEl.classList.contains('hidden')) {
      showSubjectSelect();
    }
  };

  /* =====================================================
   *  初期化
   * ===================================================== */
  createImageModal();

})();
