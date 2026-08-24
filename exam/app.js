// app.js – 介護福祉士国家試験 過去問アプリ（index.html対応版）

(function () {
  'use strict';

  /* =====================================================
   *  状態変数
   * ===================================================== */
  var allData        = {};   // { '36': [...], '37': [...], '38': [...] }
  var currentKai     = '38'; // モード別で選択中の回
  var questions      = [];
  var currentIndex   = 0;
  var score          = 0;
  var userAnswers    = [];
  var quizMode       = '';   // 'kai', 'part', 'subject'
  var furiganaOn     = false;

  /* =====================================================
   *  データファイル定義
   * ===================================================== */
  var roundFiles = {
    '36': 'data/past_exam_36.json',
    '37': 'data/past_exam_37.json',
    '38': 'data/past_exam_38.json'
  };

  /* =====================================================
   *  パート・科目定義
   * ===================================================== */
  var partSubjects = {
    'パートA': [
      '人間の尊厳と自立(にんげんのそんげんとじりつ)',
      '人間関係とコミュニケーション(にんげんかんけいとこみゅにけーしょん)',
      '社会の理解(しゃかいのりかい)'
    ],
    'パートB': [
      '介護の基本(かいごのきほん)',
      'コミュニケーション技術(こみゅにけーしょんぎじゅつ)',
      '生活支援技術(せいかつしえんぎじゅつ)'
    ],
    'パートC': [
      'こころとからだのしくみ',
      '発達と老化の理解(はったつとろうかのりかい)',
      '認知症の理解(にんちしょうのりかい)',
      '障害の理解(しょうがいのりかい)',
      '医療的ケア(いりょうてきけあ)',
      '介護過程(かいごかてい)',
      '総合問題(そうごうもんだい)'
    ]
  };

  /* =====================================================
   *  画面要素の取得
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
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showScreen(screen) {
    [mainMenu, partSelectEl, subjectSelectEl, quizScreen, resultScreen, summaryScreen].forEach(function (el) {
      if (el) el.classList.add('hidden');
    });
    if (screen) screen.classList.remove('hidden');
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* =====================================================
   *  JSON 読み込み
   * ===================================================== */
  function loadRound(kai, callback) {
    if (allData[kai]) {
      callback(allData[kai]);
      return;
    }
    var file = roundFiles[kai];
    if (!file) { callback([]); return; }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', file, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          allData[kai] = JSON.parse(xhr.responseText);
        } catch (e) {
          console.error('JSON parse error: ' + file, e);
          allData[kai] = [];
        }
      } else {
        allData[kai] = [];
      }
      callback(allData[kai]);
    };
    xhr.onerror = function () {
      allData[kai] = [];
      callback([]);
    };
    xhr.send();
  }

  /* =====================================================
   *  事例と問題文の分割
   * ===================================================== */
  function splitCaseAndQuestion(qText) {
    // 最優先：JSONで明示的に入れた \n\n で分割
    var nlSplit = qText.indexOf('\n\n');
    if (nlSplit !== -1) {
      var casePart = qText.substring(0, nlSplit).trim();
      var askPart  = qText.substring(nlSplit + 2).trim();
      if (casePart && askPart) {
        return { casePart: casePart, askPart: askPart };
      }
    }

    // 〔事例〕を含まない場合は分割しない
    if (
      qText.indexOf('〔事例') === -1 &&
      qText.indexOf('（事例）') === -1 &&
      qText.indexOf('【事例】') === -1 &&
      qText.indexOf('【事例')  === -1
    ) {
      return null;
    }

    // 末尾の問いかけ文を検出するパターン
    var splitPatterns = [
      /(.+?)(\n\n.+)$/s,
      /(.+(?:である|った|ている|いる|した|ない|ある|れた|てい?た)。\s*)((?:この|その|Ａさん|Ｂさん|Ｃさん|Ｄさん|Ｅさん|Ｆさん|Ｇさん|Ｈさん|Ｊさん|Ｋさん|Ｌさん|Ｍさん|入所|利用|介護|日常|次回).+)$/s,
      /(.+(?:である|った|ている|いる|した|ない|ある|れた|てい?た)。\s*)((?:問題\s*\d+|次の|以下の).+)$/s
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

  /* =====================================================
   *  ふりがな処理
   * ===================================================== */
  function removeFurigana(text) {
    // （ひらがな） や (ひらがな) を除去
    return text
      .replace(/（[ぁ-ん、\s]+）/g, '')
      .replace(/\([ぁ-ん、\s]+\)/g, '');
  }

  function applyFuriganaToText(text) {
    if (furiganaOn) return text;
    return removeFurigana(text);
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
   *  回ごとに挑戦 — startExamByKai
   * ===================================================== */
  window.startExamByKai = function (kai) {
    loadRound(kai, function (data) {
      if (!data || data.length === 0) {
        alert('データの読み込みに失敗しました。');
        return;
      }
      questions    = data.slice(); // 順番通り
      currentIndex = 0;
      score        = 0;
      userAnswers  = [];
      quizMode     = 'kai';
      showScreen(quizScreen);
      renderQuestion();
    });
  };

  /* =====================================================
   *  モード別 — 回の切り替え
   * ===================================================== */
  window.switchKai = function (kai) {
    currentKai = kai;
    ['38', '37', '36'].forEach(function (k) {
      var btn = document.getElementById('kaiBtn' + k);
      if (btn) {
        btn.classList.toggle('active', k === kai);
      }
    });
  };

  /* =====================================================
   *  パート選択
   * ===================================================== */
  window.showPartSelect = function () {
    var title = document.getElementById('partSelectTitle');
    if (title) title.textContent = '第' + currentKai + '回 — パートを選んでください';
    showScreen(partSelectEl);
  };

  window.startByPart = function (part) {
    loadRound(currentKai, function (data) {
      var filtered = data.filter(function (q) { return q.part === part; });
      if (filtered.length === 0) {
        alert('該当する問題がありません。');
        return;
      }
      questions    = shuffleArray(filtered);
      currentIndex = 0;
      score        = 0;
      userAnswers  = [];
      quizMode     = 'part';
      showScreen(quizScreen);
      renderQuestion();
    });
  };

  /* =====================================================
   *  科目選択
   * ===================================================== */
  window.showSubjectSelect = function () {
    var title = document.getElementById('subjectSelectTitle');
    if (title) title.textContent = '第' + currentKai + '回 — 科目を選んでください';

    subjectListEl.innerHTML = '';

    // 全科目をフラットに列挙
    var allSubjects = [];
    Object.keys(partSubjects).forEach(function (p) {
      partSubjects[p].forEach(function (s) {
        allSubjects.push(s);
      });
    });

    allSubjects.forEach(function (subj) {
      var li  = document.createElement('li');
      var btn = document.createElement('button');
      btn.className   = 'menu-item';
      btn.textContent = subj;
      btn.addEventListener('click', function () {
        startBySubject(subj);
      });
      li.appendChild(btn);
      subjectListEl.appendChild(li);
    });

    showScreen(subjectSelectEl);
  };

  function startBySubject(subject) {
    loadRound(currentKai, function (data) {
      var filtered = data.filter(function (q) { return q.subject === subject; });
      if (filtered.length === 0) {
        alert('該当する問題がありません。');
        return;
      }
      questions    = shuffleArray(filtered);
      currentIndex = 0;
      score        = 0;
      userAnswers  = [];
      quizMode     = 'subject';
      showScreen(quizScreen);
      renderQuestion();
    });
  }

  /* =====================================================
   *  戻る系
   * ===================================================== */
  window.backToMain = function () {
    showScreen(mainMenu);
  };

  window.backToMainFromSummary = function () {
    showScreen(mainMenu);
  };

  window.quitQuiz = function () {
    if (confirm('メニューに戻りますか？')) {
      showScreen(mainMenu);
    }
  };

  /* =====================================================
   *  問題描画
   * ===================================================== */
  function renderQuestion() {
    var q = questions[currentIndex];

    // プログレス
    var progressText = document.getElementById('quizProgressText');
    var progressFill = document.getElementById('quizProgressFill');
    var quizNumber   = document.getElementById('quizNumber');
    var quizSubject  = document.getElementById('quizSubject');
    var questionEl   = document.getElementById('quizQuestion');
    var choicesEl    = document.getElementById('choicesList');

    if (progressText) progressText.textContent = (currentIndex + 1) + ' / ' + questions.length;
    if (progressFill) progressFill.style.width = ((currentIndex + 1) / questions.length * 100) + '%';
    if (quizNumber)   quizNumber.textContent   = '問' + (q.id || (currentIndex + 1));
    if (quizSubject)  quizSubject.textContent  = applyFuriganaToText(q.subject || '');

    /* ---------- 問題文 ---------- */
    var qText  = q.question || '';
    var displayText = applyFuriganaToText(qText);
    var result = splitCaseAndQuestion(displayText);

    var html = '';
    if (result) {
      html += '<div class="case-box">' + escapeHTML(result.casePart) + '</div>';
      html += '<div class="question-text">' + escapeHTML(result.askPart) + '</div>';
    } else {
      html += '<div class="question-text">' + escapeHTML(displayText) + '</div>';
    }

    /* 問題画像 */
    if (q.question_image) {
      html += '<div class="question-image-wrap">'
            + '<img src="' + escapeHTML(q.question_image) + '" alt="問題画像" class="question-image" style="cursor:pointer;" />'
            + '</div>';
    }

    questionEl.innerHTML = html;

    /* 問題画像クリック */
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
      btn.className = 'choice-btn';

      /* パターン1: 文字列 */
      if (typeof choiceData === 'string') {
        var label = document.createElement('span');
        label.className   = 'choice-number';
        label.textContent = (i + 1);
        btn.appendChild(label);

        var text = document.createElement('span');
        text.textContent = applyFuriganaToText(choiceData);
        btn.appendChild(text);
      }

      /* パターン2: { type: "image", src, alt } */
      else if (typeof choiceData === 'object' && choiceData !== null && choiceData.type === 'image') {
        btn.classList.add('image-choice');

        var label2 = document.createElement('span');
        label2.className   = 'choice-number';
        label2.textContent = (i + 1);
        btn.appendChild(label2);

        var img2 = document.createElement('img');
        img2.src           = choiceData.src;
        img2.alt           = choiceData.alt || '選択肢' + (i + 1);
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
          text3.textContent = applyFuriganaToText(choiceData.text);
          btn.appendChild(text3);
        }
        if (choiceData.image) {
          var img3 = document.createElement('img');
          img3.src           = choiceData.image;
          img3.alt           = choiceData.text || '選択肢' + (i + 1);
          img3.style.cssText = 'max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;';
          img3.addEventListener('click', function (e) {
            e.stopPropagation();
            openImageModal(this.src);
          });
          btn.appendChild(img3);
        }
      }

      /* 選択肢クリック → 正誤判定 */
      btn.addEventListener('click', function () {
        userAnswers[currentIndex] = i;
        var correct = q.answer;
        if (i === correct) {
          score++;
        }
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
    var correct = q.answer;
    var isCorrect = selected === correct;

    var resultIcon = document.getElementById('resultIcon');
    var resultText = document.getElementById('resultText');
    var resultAnswer = document.getElementById('resultAnswer');
    var resultExplanation = document.getElementById('resultExplanation');
    var nextButton = document.getElementById('nextButton');

    if (resultIcon) resultIcon.textContent = isCorrect ? '⭕' : '❌';
    if (resultText) resultText.textContent = isCorrect ? '正解！' : '不正解…';

    if (resultAnswer) resultAnswer.textContent = (correct + 1);

    /* 解説 */
    if (resultExplanation) {
      if (q.explanation) {
        resultExplanation.textContent = applyFuriganaToText(q.explanation);
      } else {
        resultExplanation.textContent = '解説はありません。';
      }
    }

    /* 最後の問題なら「結果を見る」に変更 */
    if (nextButton) {
      if (currentIndex >= questions.length - 1) {
        nextButton.textContent = '結果を見る 📊';
      } else {
        nextButton.textContent = '次へ ▶';
      }
    }

    showScreen(resultScreen);
  }

  /* =====================================================
   *  次の問題 / 結果サマリー
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

  /* =====================================================
   *  結果サマリー画面
   * ===================================================== */
  function showSummary() {
    var summaryEmoji   = document.getElementById('summaryEmoji');
    var summaryScore   = document.getElementById('summaryScore');
    var summaryTotal   = document.getElementById('summaryTotal');
    var summaryBarFill = document.getElementById('summaryBarFill');
    var summaryMessage = document.getElementById('summaryMessage');

    var pct = Math.round(score / questions.length * 100);

    if (summaryScore) summaryScore.textContent = score;
    if (summaryTotal) summaryTotal.textContent = '/ ' + questions.length + '問中';
    if (summaryBarFill) summaryBarFill.style.width = pct + '%';

    var emoji = '🎉';
    var msg   = 'お疲れさまでした！';
    if (pct >= 90) {
      emoji = '🏆'; msg = '素晴らしい！合格レベルです！';
    } else if (pct >= 70) {
      emoji = '🎉'; msg = 'よくできました！';
    } else if (pct >= 50) {
      emoji = '💪'; msg = 'もう少し頑張りましょう！';
    } else {
      emoji = '📖'; msg = '復習して再挑戦しましょう！';
    }

    if (summaryEmoji)   summaryEmoji.textContent   = emoji;
    if (summaryMessage) summaryMessage.textContent  = msg;

    showScreen(summaryScreen);
  }

  /* =====================================================
   *  リトライ
   * ===================================================== */
  window.retryQuiz = function () {
    currentIndex = 0;
    score        = 0;
    userAnswers  = [];
    if (quizMode === 'kai') {
      // 同じ順番で再出題
    } else {
      questions = shuffleArray(questions);
    }
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
    if (status) status.textContent = furiganaOn ? 'ON' : 'OFF';
    if (track)  track.classList.toggle('on', furiganaOn);

    // 出題中なら再描画
    if (!quizScreen.classList.contains('hidden') && questions.length > 0) {
      renderQuestion();
    }
  };

  /* =====================================================
   *  初期化 — 画像モーダル生成
   * ===================================================== */
  createImageModal();

})();
