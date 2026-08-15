/* ===================================
   過去問アプリ - メインロジック
   manabi-フラッシュカード-kaigo-
   Created by Mitsuhide Muneishi
   =================================== */

/* ========== グローバル変数 ========== */
var allQuestions = [];
var quizQuestions = [];
var currentIndex = 0;
var correctCount = 0;
var furiganaOn = false;
var lastSelected = null;

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

// 「社会福祉（しゃかいふくし）」→「社会福祉」（括弧ごと削除）
function removeRuby(text) {
  if (!text) return '';
  return text.replace(/（[^）]*）/g, '');
}

// 「社会福祉（しゃかいふくし）の理念（りねん）」→「しゃかいふくしのりねん」
function toHiragana(text) {
  if (!text) return '';
  var result = text.replace(/[一-龥々〇ヶ]+（([^）]*)）/g, '$1');
  result = result.replace(/[ァ-ヴー]+（([^）]*)）/g, '$1');
  result = result.replace(/（[^）]*）/g, '');
  return result;
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
  if (typeof raw === 'object') return raw;
  if (furiganaOn) {
    return toHiragana(raw);
  }
  return removeRuby(raw);
}

/* ========== 初期化：JSONデータ読み込み ========== */
window.addEventListener('DOMContentLoaded', function() {
  initScreens();

  fetch('data/past_exam.json')
    .then(function(response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      allQuestions = data;
      console.log('問題データ読み込み完了：' + data.length + '問');
      buildSubjectList();
    })
    .catch(function(error) {
      console.error('データ読み込みエラー：', error);
      alert('問題データの読み込みに失敗しました。\ndata/past_exam.json を確認してください。');
    });

  // ふりがな設定を復元
  var saved = localStorage.getItem('kaigo-exam-furigana');
  if (saved === 'on') {
    furiganaOn = true;
    updateFuriganaUI();
  }
});

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

/* ========== 出題モード：全問 ========== */
function startExam() {
  quizQuestions = allQuestions.slice();
  shuffleArray(quizQuestions);
  currentIndex = 0;
  correctCount = 0;
  lastSelected = null;
  showScreen('quizScreen');
  displayQuestion();
}

/* ========== 出題モード：パート別 ========== */
function showPartSelect() {
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

/* ========== 出題モード：科目別 ========== */
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

/* ========== 問題表示 ========== */
function displayQuestion() {
  var q = quizQuestions[currentIndex];
  var total = quizQuestions.length;

  // プログレス更新
  var progressText = document.getElementById('quizProgressText');
  var progressFill = document.getElementById('quizProgressFill');
  if (progressText) {
    progressText.textContent = (currentIndex + 1) + ' / ' + total;
  }
  if (progressFill) {
    var pct = Math.round(((currentIndex + 1) / total) * 100);
    progressFill.style.width = pct + '%';
  }

  // 問番号・科目
  var numEl = document.getElementById('quizNumber');
  var subjEl = document.getElementById('quizSubject');
  if (numEl) numEl.textContent = '問' + q.id;
  if (subjEl) subjEl.textContent = getText(q, 'subject');

  // 設問文
  var qEl = document.getElementById('quizQuestion');
  if (qEl) qEl.textContent = getText(q, 'question');

  // 選択肢
  var listEl = document.getElementById('choicesList');
  if (!listEl) return;
  listEl.innerHTML = '';

  q.choices.forEach(function(choice, i) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.className = 'choice-button';

    var choiceData = getChoiceText(q, i);

    if (typeof choiceData === 'object' && choiceData !== null && choiceData.type === 'image') {
      btn.classList.add('image-choice');
      btn.innerHTML =
        '<span class="choice-number">' + (i + 1) + '</span>' +
        '<img src="' + choiceData.src + '" alt="' + (choiceData.alt || '選択肢' + (i + 1)) + '">';
    } else {
      btn.innerHTML =
        '<span class="choice-number">' + (i + 1) + '</span>' +
        '<span class="choice-text">' + choiceData + '</span>';
    }

    btn.addEventListener('click', (function(answerNum) {
      return function() {
        selectAnswer(answerNum);
      };
    })(i + 1));

    li.appendChild(btn);
    listEl.appendChild(li);
  });
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

  // 正解番号
  var ansEl = document.getElementById('resultAnswer');
  if (ansEl) ansEl.textContent = q.answer;

  // 解説
  var expEl = document.getElementById('resultExplanation');
  if (expEl) expEl.textContent = getText(q, 'explanation');

  // ボタン文言
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

/* ========== もう一度挑戦（同じ問題セットで再シャッフル） ========== */
function retryQuiz() {
  shuffleArray(quizQuestions);
  currentIndex = 0;
  correctCount = 0;
  lastSelected = null;
  showScreen('quizScreen');
  displayQuestion();
}
