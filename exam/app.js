// app.js – 介護福祉士国家試験 過去問アプリ（修正版）

document.addEventListener('DOMContentLoaded', function () {

  /* =====================================================
   *  要素取得
   * ===================================================== */
  var startScreen      = document.getElementById('start-screen');
  var quizScreen       = document.getElementById('quiz-screen');
  var resultScreen     = document.getElementById('result-screen');
  var reviewScreen     = document.getElementById('review-screen');
  var startBtn         = document.getElementById('start-btn');
  var nextBtn          = document.getElementById('next-btn');
  var prevBtn          = document.getElementById('prev-btn');
  var retryBtn         = document.getElementById('retry-btn');
  var backBtn          = document.getElementById('back-btn');
  var reviewRetryBtn   = document.getElementById('review-retry-btn');
  var reviewBackBtn    = document.getElementById('review-back-btn');
  var questionEl       = document.getElementById('question');
  var choicesEl        = document.getElementById('choices');
  var feedbackEl       = document.getElementById('feedback');
  var progressEl       = document.getElementById('progress');
  var scoreEl          = document.getElementById('score');
  var reviewListEl     = document.getElementById('review-list');
  var showReviewBtn    = document.getElementById('show-review-btn');
  var roundSelect      = document.getElementById('round-select');
  var partSelect       = document.getElementById('part-select');
  var subjectSelect    = document.getElementById('subject-select');
  var questionCounter  = document.getElementById('question-counter');

  /* =====================================================
   *  状態変数
   * ===================================================== */
  var questions        = [];
  var currentIndex     = 0;
  var score            = 0;
  var userAnswers      = [];
  var answered         = false;

  /* =====================================================
   *  試験回データ定義
   * ===================================================== */
  var roundFiles = {
    '36': 'past_exam_36.json',
    '37': 'past_exam_37.json',
    '38': 'past_exam_38.json'
  };

  /* =====================================================
   *  パート定義
   * ===================================================== */
  var partSubjects = {
    'パートA': [
      '人間の尊厳と自立(にんげんのそんげんとじりつ)',
      '人間関係とコミュニケーション(にんげんかんけいとこみゅにけーしょん)',
      '社会の理解(しゃかいのりかい)',
      'こころとからだのしくみ',
      '発達と老化の理解(はったつとろうかのりかい)',
      '認知症の理解(にんちしょうのりかい)',
      '障害の理解(しょうがいのりかい)',
      '医療的ケア(いりょうてきけあ)'
    ],
    'パートB': [
      '介護の基本(かいごのきほん)',
      'コミュニケーション技術(こみゅにけーしょんぎじゅつ)',
      '生活支援技術(せいかつしえんぎじゅつ)'
    ],
    'パートC': [
      '介護過程(かいごかてい)',
      '総合問題(そうごうもんだい)'
    ]
  };

  /* =====================================================
   *  科目プルダウン生成
   * ===================================================== */
  function populateSubjects() {
    var part = partSelect.value;
    subjectSelect.innerHTML = '<option value="all">すべて</option>';
    if (part === 'all') {
      Object.keys(partSubjects).forEach(function (p) {
        partSubjects[p].forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          subjectSelect.appendChild(opt);
        });
      });
    } else if (partSubjects[part]) {
      partSubjects[part].forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        subjectSelect.appendChild(opt);
      });
    }
  }
  partSelect.addEventListener('change', populateSubjects);
  populateSubjects();

  /* =====================================================
   *  JSON 読み込み & フィルタリング
   * ===================================================== */
  function loadQuestions(callback) {
    var round   = roundSelect.value;
    var files   = [];
    if (round === 'all') {
      Object.keys(roundFiles).forEach(function (k) { files.push(roundFiles[k]); });
    } else if (roundFiles[round]) {
      files.push(roundFiles[round]);
    }
    var allData = [];
    var loaded  = 0;
    files.forEach(function (file) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', file, true);
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            allData = allData.concat(data);
          } catch (e) {
            console.error('JSON parse error in ' + file, e);
          }
        }
        loaded++;
        if (loaded === files.length) {
          callback(allData);
        }
      };
      xhr.onerror = function () {
        loaded++;
        if (loaded === files.length) {
          callback(allData);
        }
      };
      xhr.send();
    });
  }

  function filterQuestions(data) {
    var part    = partSelect.value;
    var subject = subjectSelect.value;
    return data.filter(function (q) {
      if (part !== 'all' && q.part !== part) return false;
      if (subject !== 'all' && q.subject !== subject) return false;
      return true;
    });
  }

  /* =====================================================
   *  事例と問題文の分割
   * ===================================================== */
  function splitCaseAndQuestion(qText) {
    // ★最優先：JSONで明示的に入れた \n\n で分割
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
   *  画像モーダルを開く
   * ===================================================== */
  function openImageModal(src) {
    var modal   = document.getElementById('image-modal');
    var modalImg = document.getElementById('modal-img');
    if (modal && modalImg) {
      modalImg.src = src;
      modal.style.display = 'flex';
    }
  }

  /* =====================================================
   *  問題表示
   * ===================================================== */
  function showQuestion() {
    var q = questions[currentIndex];
    feedbackEl.textContent = '';
    feedbackEl.className   = 'feedback';
    nextBtn.style.display  = 'none';
    prevBtn.style.display  = currentIndex > 0 ? 'inline-block' : 'none';
    answered = false;

    progressEl.textContent    = 'Q' + (currentIndex + 1) + ' / ' + questions.length;
    questionCounter.textContent = '問 ' + (currentIndex + 1) + ' / ' + questions.length;

    /* ---------- 問題文の組み立て ---------- */
    var qText  = q.question || '';
    var result = splitCaseAndQuestion(qText);

    var html = '';
    if (result) {
      html += '<div class="case-box">' + escapeHTML(result.casePart) + '</div>';
      html += '<div class="question-text">' + escapeHTML(result.askPart) + '</div>';
    } else {
      html += '<div class="question-text">' + escapeHTML(qText) + '</div>';
    }

    /* 問題画像（question_image） */
    if (q.question_image) {
      html += '<div class="question-image-wrap">';
      html += '<img src="' + escapeHTML(q.question_image) + '" alt="問題画像" class="question-image" style="cursor:pointer;" />';
      html += '</div>';
    }

    questionEl.innerHTML = html;

    /* 問題画像にクリックイベントを付与 */
    var qImg = questionEl.querySelector('.question-image');
    if (qImg) {
      qImg.addEventListener('click', function () {
        openImageModal(this.src);
      });
    }

    /* ---------- 選択肢の組み立て ---------- */
    choicesEl.innerHTML = '';
    var choices = q.choices || [];

    choices.forEach(function (choiceData, i) {
      var btn = document.createElement('button');
      btn.className = 'choice-btn';

      /* --- パターン1: 文字列 --- */
      if (typeof choiceData === 'string') {
        var label = document.createElement('span');
        label.className   = 'choice-number';
        label.textContent = (i + 1);
        btn.appendChild(label);

        var text = document.createElement('span');
        text.textContent = choiceData;
        btn.appendChild(text);
      }

      /* --- パターン2: { type: "image", src, alt } --- */
      else if (typeof choiceData === 'object' && choiceData !== null && choiceData.type === 'image') {
        btn.classList.add('image-choice');

        var label2 = document.createElement('span');
        label2.className   = 'choice-number';
        label2.textContent = (i + 1);
        btn.appendChild(label2);

        var img2 = document.createElement('img');
        img2.src            = choiceData.src;
        img2.alt            = choiceData.alt || '選択肢' + (i + 1);
        img2.style.cssText  = 'max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;';
        img2.addEventListener('click', function (e) {
          e.stopPropagation();
          openImageModal(this.src);
        });
        btn.appendChild(img2);
      }

      /* --- パターン3: { text, image } --- */
      else if (typeof choiceData === 'object' && choiceData !== null) {
        var label3 = document.createElement('span');
        label3.className   = 'choice-number';
        label3.textContent = (i + 1);
        btn.appendChild(label3);

        if (choiceData.text) {
          var text3 = document.createElement('span');
          text3.textContent = choiceData.text;
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

      /* クリック処理 */
      btn.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        userAnswers[currentIndex] = i;

        var correct = q.answer;
        if (i === correct) {
          score++;
          btn.classList.add('correct');
          feedbackEl.textContent = '⭕ 正解！';
          feedbackEl.className   = 'feedback correct';
        } else {
          btn.classList.add('wrong');
          feedbackEl.textContent = '❌ 不正解… 正解は ' + (correct + 1);
          feedbackEl.className   = 'feedback wrong';
          var allBtns = choicesEl.querySelectorAll('.choice-btn');
          if (allBtns[correct]) allBtns[correct].classList.add('correct');
        }

        /* 全ボタンを無効化 */
        var allBtns2 = choicesEl.querySelectorAll('.choice-btn');
        allBtns2.forEach(function (b) { b.disabled = true; });

        nextBtn.style.display = 'inline-block';
      });

      choicesEl.appendChild(btn);
    });
  }

  /* =====================================================
   *  HTMLエスケープ
   * ===================================================== */
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* =====================================================
   *  結果画面
   * ===================================================== */
  function showResult() {
    quizScreen.style.display   = 'none';
    resultScreen.style.display = 'block';
    scoreEl.textContent = questions.length + '問中 ' + score + '問正解（' + Math.round(score / questions.length * 100) + '%）';
  }

  /* =====================================================
   *  復習画面
   * ===================================================== */
  function showReview() {
    resultScreen.style.display = 'none';
    reviewScreen.style.display = 'block';
    reviewListEl.innerHTML     = '';

    questions.forEach(function (q, idx) {
      var div  = document.createElement('div');
      div.className = 'review-item';

      var ua   = userAnswers[idx];
      var isOk = ua === q.answer;

      /* 問題文（事例分割対応） */
      var qText  = q.question || '';
      var result = splitCaseAndQuestion(qText);
      var qHTML  = '';
      if (result) {
        qHTML = '<div class="case-box">' + escapeHTML(result.casePart) + '</div>'
              + '<div class="question-text">' + escapeHTML(result.askPart) + '</div>';
      } else {
        qHTML = '<div class="question-text">' + escapeHTML(qText) + '</div>';
      }

      /* 問題画像 */
      if (q.question_image) {
        qHTML += '<div class="question-image-wrap">'
              +  '<img src="' + escapeHTML(q.question_image) + '" alt="問題画像" class="question-image review-clickable-img" style="cursor:pointer;" />'
              +  '</div>';
      }

      var header = '<div class="review-header ' + (isOk ? 'review-correct' : 'review-wrong') + '">'
                 + (isOk ? '⭕' : '❌') + ' Q' + (idx + 1)
                 + '</div>';

      /* 選択肢一覧 */
      var choicesHTML = '<ul class="review-choices">';
      (q.choices || []).forEach(function (c, ci) {
        var cls = '';
        if (ci === q.answer) cls += ' review-choice-correct';
        if (ci === ua && ua !== q.answer) cls += ' review-choice-wrong';

        var choiceContent = '';
        if (typeof c === 'string') {
          choiceContent = escapeHTML(c);
        } else if (typeof c === 'object' && c !== null && c.type === 'image') {
          choiceContent = '<img src="' + escapeHTML(c.src) + '" alt="' + escapeHTML(c.alt || '') + '" class="review-clickable-img" style="max-width:100%;border-radius:6px;cursor:pointer;" />';
        } else if (typeof c === 'object' && c !== null) {
          choiceContent = escapeHTML(c.text || '');
          if (c.image) {
            choiceContent += '<br><img src="' + escapeHTML(c.image) + '" alt="" class="review-clickable-img" style="max-width:100%;border-radius:6px;cursor:pointer;" />';
          }
        }

        choicesHTML += '<li class="' + cls.trim() + '">' + (ci + 1) + '. ' + choiceContent + '</li>';
      });
      choicesHTML += '</ul>';

      div.innerHTML = header + qHTML + choicesHTML;
      reviewListEl.appendChild(div);
    });

    /* 復習画面の画像にクリックイベントを付与 */
    var reviewImgs = reviewListEl.querySelectorAll('.review-clickable-img');
    reviewImgs.forEach(function (img) {
      img.addEventListener('click', function () {
        openImageModal(this.src);
      });
    });
  }

  /* =====================================================
   *  イベントリスナー
   * ===================================================== */
  startBtn.addEventListener('click', function () {
    loadQuestions(function (data) {
      var filtered = filterQuestions(data);
      if (filtered.length === 0) {
        alert('該当する問題がありません。条件を変更してください。');
        return;
      }
      questions    = filtered;
      currentIndex = 0;
      score        = 0;
      userAnswers  = [];
      startScreen.style.display = 'none';
      quizScreen.style.display  = 'block';
      showQuestion();
    });
  });

  nextBtn.addEventListener('click', function () {
    currentIndex++;
    if (currentIndex >= questions.length) {
      showResult();
    } else {
      showQuestion();
    }
  });

  prevBtn.addEventListener('click', function () {
    if (currentIndex > 0) {
      currentIndex--;
      showQuestion();
      /* 既に回答済みなら再表示 */
      if (userAnswers[currentIndex] !== undefined) {
        answered = true;
        var ua      = userAnswers[currentIndex];
        var correct = questions[currentIndex].answer;
        var allBtns = choicesEl.querySelectorAll('.choice-btn');
        allBtns.forEach(function (b, bi) {
          b.disabled = true;
          if (bi === correct) b.classList.add('correct');
          if (bi === ua && ua !== correct) b.classList.add('wrong');
        });
        if (ua === correct) {
          feedbackEl.textContent = '⭕ 正解！';
          feedbackEl.className   = 'feedback correct';
        } else {
          feedbackEl.textContent = '❌ 不正解… 正解は ' + (correct + 1);
          feedbackEl.className   = 'feedback wrong';
        }
        nextBtn.style.display = 'inline-block';
      }
    }
  });

  retryBtn.addEventListener('click', function () {
    resultScreen.style.display = 'none';
    startScreen.style.display  = 'block';
  });

  backBtn.addEventListener('click', function () {
    resultScreen.style.display = 'none';
    startScreen.style.display  = 'block';
  });

  showReviewBtn.addEventListener('click', function () {
    showReview();
  });

  reviewRetryBtn.addEventListener('click', function () {
    reviewScreen.style.display = 'none';
    startScreen.style.display  = 'block';
  });

  reviewBackBtn.addEventListener('click', function () {
    reviewScreen.style.display = 'none';
    resultScreen.style.display = 'block';
  });

  /* =====================================================
   *  画像モーダル（DOM生成）
   * ===================================================== */
  (function () {
    var overlay = document.createElement('div');
    overlay.id  = 'image-modal';
    overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;'
                          + 'background:rgba(0,0,0,0.8);z-index:9999;justify-content:center;align-items:center;cursor:pointer;';

    var img = document.createElement('img');
    img.id  = 'modal-img';
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;';

    overlay.appendChild(img);
    overlay.addEventListener('click', function () {
      overlay.style.display = 'none';
    });
    document.body.appendChild(overlay);
  })();

}); // end DOMContentLoaded
