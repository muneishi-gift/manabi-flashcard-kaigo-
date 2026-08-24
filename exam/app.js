/* ===================================
   過去問アプリ - メインロジック
   manabi-フラッシュカード-kaigo-
   Created by Mitsuhide Muneishi
   =================================== */

/* ========== グローバル変数 ========== */
var examData = {};        // { '38': [...], '37': [...], '36': [...] }
var allQuestions = [];     // 現在選択中の回のデータ
var quizQuestions = [];
var currentIndex = 0;
var correctCount = 0;
var furiganaOn = false;
var lastSelected = null;
var currentKai = '38';    // 現在選択中の回

/* ========== 画面の要素を取得 ========== */
var screens = {};

function initScreens() {
  screens = {
    mainMenu:      document.getElementById('mainMenu'),
    partSelect:    document.getElementById('partSelect'),
    subjectSelect: document.getElementById('subjectSelect'),
    quizScreen:    document.getElementById('quizScreen'),
    resultScreen:  document.getElementById('resultScreen'),
    summaryScreen: document.getElementById('summaryScreen')
  };
}

/* ========== ふりがな変換関数 ========== */
function removeRuby(text) {
  if (!text) return '';
  var result = text.replace(/（[^）]*）/g, '');
  result = result.replace(/\([^)]*\)/g, '');
  return result;
}

function toHiragana(text) {
  if (!text) return '';
  return text;
}

/* ========== テキスト取得（ふりがなON/OFF対応） ========== */
function getText(item, field) {
  var raw = item[field] || '';
  if (furiganaOn) {
    return toHiragana(raw);
  }
  return removeRuby(raw);
}

function getChoiceText(item, index) {
  if (!item.choices || !item.choices[index]) return '';
  var raw = item.choices[index];
  // 画像オブジェクトの場合はそのまま返す
  if (typeof raw === 'object' && raw !== null) {
    // ふりがなOFF時はtextからルビを除去
    if (!furiganaOn && raw.text) {
      return { image: raw.image, text: removeRuby(raw.text), src: raw.src, alt: raw.alt, type: raw.type };
    }
    return raw;
  }
  if (furiganaOn) {
    return toHiragana(raw);
  }
  return removeRuby(raw);
}

/* ========== 初期化：JSONデータ読み込み（3回分読む） ========== */
window.addEventListener('DOMContentLoaded', function() {
  initScreens();

  // 第38回・第37回・第36回を同時に読み込む
  Promise.all([
    fetch('data/past_exam_38.json').then(function(r) {
      if (!r.ok) throw new Error('38回: HTTP ' + r.status);
      return r.json();
    }),
    fetch('data/past_exam_37.json').then(function(r) {
      if (!r.ok) throw new Error('37回: HTTP ' + r.status);
      return r.json();
    }),
    fetch('data/past_exam_36.json').then(function(r) {
      if (!r.ok) throw new Error('36回: HTTP ' + r.status);
      return r.json();
    })
  ])
  .then(function(results) {
    examData['38'] = results[0];
    examData['37'] = results[1];
    examData['36'] = results[2];
    console.log('第38回：' + results[0].length + '問 読み込み完了');
    console.log('第37回：' + results[1].length + '問 読み込み完了');
    console.log('第36回：' + results[2].length + '問 読み込み完了');

    // デフォルトは第38回
    allQuestions = examData['38'];
    buildSubjectList();
  })
  .catch(function(error) {
    console.error('データ読み込みエラー：', error);
    alert('問題データの読み込みに失敗しました。\ndata/ フォルダ内の JSON を確認してください。\n\nエラー: ' + error.message);
  });

  // ふりがな設定を復元
  var saved = localStorage.getItem('kaigo-exam-furigana');
  if (saved === 'on') {
    furiganaOn = true;
    updateFuriganaUI();
  }
});

/* ========== 回の切り替え（モード別用） ========== */
function switchKai(kai) {
  if (!examData[kai]) {
    alert('第' + kai + '回のデータはまだ準備中です。');
    return;
  }
  currentKai = kai;
  allQuestions = examData[kai];

  // ボタンのアクティブ状態を更新
  var btns = document.querySelectorAll('.menu-kai-btn');
  btns.forEach(function(btn) {
    btn.classList.remove('active');
  });
  var activeBtn = document.getElementById('kaiBtn' + kai);
  if (activeBtn) activeBtn.classList.add('active');

  // 科目リストが表示中なら更新
  if (!screens.subjectSelect.classList.contains('hidden')) {
    buildSubjectList();
  }

  console.log('第' + kai + '回に切り替え：' + allQuestions.length + '問');
}

/* ========== 回ごとに挑戦（順番通り） ========== */
function startExamByKai(kai) {
  if (!examData[kai]) {
    alert('第' + kai + '回のデータはまだ準備中です。');
    return;
  }
  currentKai = kai;
  allQuestions = examData[kai];
  quizQuestions = allQuestions.slice();
  currentIndex = 0;
  correctCount = 0;
  lastSelected = null;
  showScreen('quizScreen');
  displayQuestion();
}

/* ========== 画面切り替え ========== */
function showScreen(screenId) {
  Object.keys(screens).forEach(function(key) {
    if (screens[key]) {
      screens[key].classList.add('hidden');
    }
  });
  if (screens[screenId]) {
    screens[screenId].classList.remove('hidden');
  }
  window.scrollTo(0, 0);
}

function backToMain() {
  showScreen('mainMenu');
}

function quitQuiz() {
  if (confirm('問題をやめてメニューに戻りますか？')) {
    showScreen('mainMenu');
  }
}

/* ========== ふりがな切り替え ========== */
function toggleFurigana() {
  furiganaOn = !furiganaOn;
  updateFuriganaUI();
  localStorage.setItem('kaigo-exam-furigana', furiganaOn ? 'on' : 'off');

  if (!screens.quizScreen.classList.contains('hidden')) {
    displayQuestion();
  }
  if (!screens.resultScreen.classList.contains('hidden')) {
    displayResult(currentIndex, null);
  }
  if (!screens.subjectSelect.classList.contains('hidden')) {
    buildSubjectList();
  }
}

function updateFuriganaUI() {
  var track = document.getElementById('furiganaTrack');
  var status = document.getElementById('furiganaStatus');
  if (!track || !status) return;
  if (furiganaOn) {
    track.classList.add('active');
    status.classList.add('active');
    status.textContent = 'ON';
  } else {
    track.classList.remove('active');
    status.classList.remove('active');
    status.textContent = 'OFF';
  }
}

/* ========== 科目リスト生成 ========== */
function buildSubjectList() {
  var subjectMap = {};
  var subjectOrder = [];

  allQuestions.forEach(function(q) {
    var subj = removeRuby(q.subject);
    if (!subjectMap[subj]) {
      subjectMap[subj] = { count: 0, raw: q.subject };
      subjectOrder.push(subj);
    }
    subjectMap[subj].count++;
  });

  var listEl = document.getElementById('subjectList');
  if (!listEl) return;
  listEl.innerHTML = '';

  // タイトルに回を表示
  var titleEl = document.getElementById('subjectSelectTitle');
  if (titleEl) titleEl.textContent = '第' + currentKai + '回 ─ 科目を選んでください';

  subjectOrder.forEach(function(subj, i) {
    var info = subjectMap[subj];
    var displayName = furiganaOn ? toHiragana(info.raw) : subj;
    var li = document.createElement('li');
    var div = document.createElement('div');
    div.className = 'subject-item';
    div.innerHTML =
      '<div class="subject-badge">' + (i + 1) + '</div>' +
      '<div class="subject-name">' + displayName + '</div>' +
      '<div class="subject-count">' + info.count + '問</div>';
    div.addEventListener('click', (function(rawSubject) {
      return function() {
        startBySubject(rawSubject);
      };
    })(info.raw));
    li.appendChild(div);
    listEl.appendChild(li);
  });
}

/* ========== 出題モード：全問（順番通り）※旧互換 ========== */
function startExam() {
  startExamByKai(currentKai);
}

/* ========== 出題モード：パート別（ランダム） ========== */
function showPartSelect() {
  var titleEl = document.getElementById('partSelectTitle');
  if (titleEl) titleEl.textContent = '第' + currentKai + '回 ─ パートを選んでください';
  showScreen('partSelect');
}

function startByPart(partName) {
  quizQuestions = allQuestions.filter(function(q) {
    return q.part === partName;
  });
  if (quizQuestions.length === 0) {
    alert('該当する問題がありません。');
    return;
  }
  shuffleArray(quizQuestions);
  currentIndex = 0;
  correctCount = 0;
  lastSelected = null;
  showScreen('quizScreen');
  displayQuestion();
}

/* ========== 出題モード：科目別（ランダム） ========== */
function showSubjectSelect() {
  buildSubjectList();
  showScreen('subjectSelect');
}

function startBySubject(subjectRaw) {
  quizQuestions = allQuestions.filter(function(q) {
    return q.subject === subjectRaw;
  });
  if (quizQuestions.length === 0) {
    alert('該当する問題がありません。');
    return;
  }
  shuffleArray(quizQuestions);
  currentIndex = 0;
  correctCount = 0;
  lastSelected = null;
  showScreen('quizScreen');
  displayQuestion();
}

/* ========== シャッフル ========== */
function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}

/* ========== 事例と問題文の自動分割 ========== */
function splitCaseAndQuestion(qText) {
  // 〔事例〕を含まない場合は分割しない
if (qText.indexOf('〔事例') === -1 && qText.indexOf('（事例）') === -1 && qText.indexOf('【事例】') === -1 && qText.indexOf('【事例') === -1) {
    return null;
}
  // 末尾の問いかけ文を検出するパターン（優先順）
  var splitPatterns = [
    /([。」])\s*(最も適切なものを.*)$/,
    /([。」])\s*(最も適切な対応を.*)$/,
    /([。」])\s*(最も優先すべき.*)$/,
    /([。」])\s*(適切なものを.*)$/,
    /([。」])\s*(次のうち.*)$/,
    /([。」])\s*(今後、引き起こされる.*)$/,
    /([。」])\s*(この場面で.*)$/,
    /([。」])\s*(このときの.*)$/,
    /([。」])\s*(その後.*)$/,
    /([。」])\s*(Aさん|Bさん|Cさん|Dさん|Eさん|Fさん|Gさん|Hさん|Jさん|Kさん|Lさん|Mさん)(の食事|の入浴|の状態|の様子|の行動|の気持ち|の二次障害|に対する|に起こり|について|が利用|への)(.*)$/
  ];

  for (var p = 0; p < splitPatterns.length; p++) {
    var m = qText.match(splitPatterns[p]);
    if (m) {
      var idx = qText.lastIndexOf(m[0]);
      var casePart = qText.substring(0, idx + m[1].length).trim();
      var askPart = qText.substring(idx + m[1].length).trim();
      if (casePart && askPart) {
        return { casePart: casePart, askPart: askPart };
      }
    }
  }

  // パターンにマッチしない場合、最後の「。」から後ろを問題文とする
  var lastPeriod = qText.lastIndexOf('。', qText.length - 2);
  if (lastPeriod > qText.length * 0.3) {
    var casePart2 = qText.substring(0, lastPeriod + 1).trim();
    var askPart2 = qText.substring(lastPeriod + 1).trim();
    if (casePart2 && askPart2 && askPart2.length > 10) {
      return { casePart: casePart2, askPart: askPart2 };
    }
  }

  return null;
}

/* ========== 問題表示 ========== */
function displayQuestion() {
  var q = quizQuestions[currentIndex];
  var total = quizQuestions.length;

  var progressText = document.getElementById('quizProgressText');
  var progressFill = document.getElementById('quizProgressFill');
  if (progressText) {
    progressText.textContent = (currentIndex + 1) + ' / ' + total;
  }
  if (progressFill) {
    var pct = Math.round(((currentIndex + 1) / total) * 100);
    progressFill.style.width = pct + '%';
  }

  var numEl = document.getElementById('quizNumber');
  var subjEl = document.getElementById('quizSubject');
  if (numEl) numEl.textContent = '問' + q.id;
  if (subjEl) subjEl.textContent = getText(q, 'subject');

  /* --- 事例と問題文の分割表示 --- */
  var qEl = document.getElementById('quizQuestion');
  if (qEl) {
    var qText = getText(q, 'question');
    var split = splitCaseAndQuestion(qText);

    if (split) {
      qEl.innerHTML =
        '<div class="question-case">' + escapeHtml(split.casePart) + '</div>' +
        '<div class="question-ask">' + escapeHtml(split.askPart) + '</div>';
    } else {
      qEl.textContent = qText;
    }
  }

  /* --- 選択肢リスト --- */
  var listEl = document.getElementById('choicesList');
  if (!listEl) return;
  listEl.innerHTML = '';

  /* 問題画像（questionImage） */
  if (q.questionImage) {
    var qImg = document.createElement('img');
    qImg.src = q.questionImage;
    qImg.alt = '設問画像';
    qImg.style.cssText =
      'display:block;max-width:90%;margin:12px auto;border:1px solid #ccc;border-radius:8px;cursor:pointer;';
    qImg.addEventListener('click', function() {
      openImageModal(this.src);
    });
    listEl.appendChild(qImg);
  }

  /* 各選択肢 */
  q.choices.forEach(function(choice, i) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.className = 'choice-button';

    var choiceData = getChoiceText(q, i);

    /* --- パターン1: { image: "...", text: "..." } --- */
    if (typeof choiceData === 'object' && choiceData !== null && choiceData.image) {
      btn.classList.add('image-choice');

      var label = document.createElement('span');
      label.className = 'choice-number';
      label.textContent = (i + 1);
      btn.appendChild(label);

      var img = document.createElement('img');
      img.src = choiceData.image;
      img.alt = choiceData.text || ('選択肢' + (i + 1));
      img.style.cssText = 'max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;';
      img.addEventListener('click', function(e) {
        e.stopPropagation();
        openImageModal(this.src);
      });
      btn.appendChild(img);

      if (choiceData.text) {
        var textSpan = document.createElement('span');
        textSpan.className = 'choice-text';
        textSpan.textContent = choiceData.text;
        textSpan.style.cssText = 'display:block;margin-top:4px;font-weight:600;';
        btn.appendChild(textSpan);
      }

    /* --- パターン2: { type: "image", src: "...", alt: "..." } --- */
    } else if (typeof choiceData === 'object' && choiceData !== null && choiceData.type === 'image') {
      btn.classList.add('image-choice');
      btn.innerHTML =
        '<span class="choice-number">' + (i + 1) + '</span>' +
        '<img src="' + escapeHtml(choiceData.src) + '" alt="' + escapeHtml(choiceData.alt || '選択肢' + (i + 1)) + '" style="max-width:100%;border-radius:6px;margin-top:4px;cursor:pointer;">';

    /* --- パターン3: 通常テキスト --- */
    } else {
      var displayText = (typeof choiceData === 'object' && choiceData !== null) ? (choiceData.text || '') : (choiceData || '');
      btn.innerHTML =
        '<span class="choice-number">' + (i + 1) + '</span>' +
        '<span class="choice-text">' + escapeHtml(displayText) + '</span>';
    }

    btn.addEventListener('click', (function(answerNum) {
      return function() {
        selectAnswer(answerNum);
      };
    })(i + 1));

    li.appendChild(btn);
    listEl.appendChild(li);
  });

  /* --- ナビゲーションボタン --- */
  var oldNav = listEl.parentNode.querySelector('.quiz-nav-buttons');
  if (oldNav) oldNav.remove();

  var navDiv = document.createElement('div');
  navDiv.className = 'quiz-nav-buttons';
  navDiv.style.cssText = 'display:flex;justify-content:center;gap:16px;margin-top:24px;';

  var prevBtn = document.createElement('button');
  prevBtn.textContent = '◀ 戻る';
  prevBtn.style.cssText = 'flex:1;max-width:180px;padding:14px 0;font-size:1.1rem;font-weight:700;border:none;border-radius:50px;letter-spacing:0.05em;';
  if (currentIndex > 0) {
    prevBtn.style.cssText += 'cursor:pointer;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;box-shadow:0 4px 15px rgba(102,126,234,0.4);';
    prevBtn.addEventListener('click', function() { goToPrevQuestion(); });
  } else {
    prevBtn.style.cssText += 'background:#555;color:#888;opacity:0.5;';
    prevBtn.disabled = true;
  }

  var nextBtn = document.createElement('button');
  nextBtn.textContent = '次へ ▶';
  nextBtn.style.cssText = 'flex:1;max-width:180px;padding:14px 0;font-size:1.1rem;font-weight:700;border:none;border-radius:50px;letter-spacing:0.05em;';
  if (currentIndex < total - 1) {
    nextBtn.style.cssText += 'cursor:pointer;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;box-shadow:0 4px 15px rgba(102,126,234,0.4);';
    nextBtn.addEventListener('click', function() { goToNextQuestion(); });
  } else {
    nextBtn.style.cssText += 'background:#555;color:#888;opacity:0.5;';
    nextBtn.disabled = true;
  }

  navDiv.appendChild(prevBtn);
  navDiv.appendChild(nextBtn);
  listEl.parentNode.appendChild(navDiv);
}

/* ========== HTMLエスケープ ========== */
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ========== 問題ナビゲーション ========== */
function goToPrevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    displayQuestion();
  }
}

function goToNextQuestion() {
  if (currentIndex < quizQuestions.length - 1) {
    currentIndex++;
    displayQuestion();
  }
}

/* ========== 回答選択 ========== */
function selectAnswer(selected) {
  var q = quizQuestions[currentIndex];
  var isCorrect = (selected === q.answer);
  lastSelected = selected;

  if (isCorrect) {
    correctCount++;
  }

  displayResult(currentIndex, isCorrect);
  showScreen('resultScreen');
}

/* ========== 正誤画面表示 ========== */
function displayResult(qIndex, isCorrect) {
  var q = quizQuestions[qIndex];

  var iconEl = document.getElementById('resultIcon');
  var textEl = document.getElementById('resultText');

  if (isCorrect !== null && iconEl && textEl) {
    if (isCorrect) {
      iconEl.textContent = '⭕';
      textEl.textContent = '正解！';
      textEl.className = 'result-text correct';
    } else {
      iconEl.textContent = '❌';
      textEl.textContent = '不正解…';
      textEl.className = 'result-text incorrect';
    }
  }

  var ansEl = document.getElementById('resultAnswer');
  if (ansEl) ansEl.textContent = q.answer;

  var expEl = document.getElementById('resultExplanation');
  if (expEl) expEl.textContent = getText(q, 'explanation');

  var nextBtn = document.getElementById('nextButton');
  if (nextBtn) {
    if (currentIndex >= quizQuestions.length - 1) {
      nextBtn.textContent = '結果を見る 🏆';
    } else {
      nextBtn.textContent = '次へ ▶';
    }
  }
}

/* ========== 次の問題へ ========== */
function nextQuestion() {
  currentIndex++;

  if (currentIndex >= quizQuestions.length) {
    showSummary();
    return;
  }

  showScreen('quizScreen');
  displayQuestion();
}

/* ========== 結果サマリー ========== */
function showSummary() {
  var total = quizQuestions.length;
  var pct = Math.round((correctCount / total) * 100);

  var scoreEl = document.getElementById('summaryScore');
  var totalEl = document.getElementById('summaryTotal');
  var barEl = document.getElementById('summaryBarFill');
  var emojiEl = document.getElementById('summaryEmoji');
  var msgEl = document.getElementById('summaryMessage');

  if (scoreEl) scoreEl.textContent = correctCount;
  if (totalEl) totalEl.textContent = '/ ' + total + '問中';
  if (barEl) barEl.style.width = pct + '%';

  var emoji, message;
  if (pct === 100) {
    emoji = '👑';
    message = 'パーフェクト！素晴らしい！';
  } else if (pct >= 80) {
    emoji = '🎉';
    message = '合格ライン！よく頑張りました！';
  } else if (pct >= 60) {
    emoji = '💪';
    message = 'あと少し！もう一度挑戦しよう！';
  } else if (pct >= 40) {
    emoji = '📖';
    message = '復習して再チャレンジ！';
  } else {
    emoji = '🔥';
    message = 'ここからスタート！繰り返しが大事！';
  }

  if (emojiEl) emojiEl.textContent = emoji;
  if (msgEl) msgEl.textContent = message + '（正答率 ' + pct + '%）';

  showScreen('summaryScreen');
}

/* ========== メニューに戻る（結果画面から） ========== */
function backToMainFromSummary() {
  showScreen('mainMenu');
}

/* ========== もう一度挑戦 ========== */
function retryQuiz() {
  shuffleArray(quizQuestions);
  currentIndex = 0;
  correctCount = 0;
  lastSelected = null;
  showScreen('quizScreen');
  displayQuestion();
}

/* ========== 画像拡大モーダル ========== */
(function() {
  var overlay = document.createElement('div');
  overlay.id = 'imgModal';
  overlay.style.cssText =
    'display:none;position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(0,0,0,.85);z-index:9999;justify-content:center;' +
    'align-items:center;cursor:pointer;';

  var modalImg = document.createElement('img');
  modalImg.style.cssText =
    'max-width:92%;max-height:92%;border-radius:8px;box-shadow:0 0 20px #000;';
  overlay.appendChild(modalImg);

  var closeBtn = document.createElement('span');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText =
    'position:absolute;top:16px;right:24px;color:#fff;font-size:32px;' +
    'font-weight:bold;cursor:pointer;';
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);

  window.openImageModal = function(src) {
    modalImg.src = src;
    overlay.style.display = 'flex';
  };

  overlay.addEventListener('click', function() {
    overlay.style.display = 'none';
  });
})();
