/* ===================================
   過去問アプリ - メインロジック
   manabi-フラッシュカード-kaigo-
   Created by Mitsuhide Muneishi
   =================================== */

/* ========== グローバル変数 ========== */
let allQuestions = [];      // 全問題データ
let quizQuestions = [];     // 現在の出題リスト
let currentIndex = 0;       // 現在の問題番号
let correctCount = 0;       // 正解数
let furiganaOn = false;     // ふりがなON/OFF

/* ========== 画面の要素を取得 ========== */
const screens = {
  mainMenu:      document.getElementById('mainMenu'),
  partSelect:    document.getElementById('partSelect'),
  subjectSelect: document.getElementById('subjectSelect'),
  quizScreen:    document.getElementById('quizScreen'),
  resultScreen:  document.getElementById('resultScreen'),
  summaryScreen: document.getElementById('summaryScreen')
};

/* ========== 初期化：JSONデータ読み込み ========== */
window.addEventListener('DOMContentLoaded', function() {
  fetch('../data/past_exam.json')
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      allQuestions = data;
      console.log('問題データ読み込み完了：' + data.length + '問');
      buildSubjectList();
    })
    .catch(function(error) {
      console.error('データ読み込みエラー：', error);
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
    screens[key].classList.add('hidden');
  });
  screens[screenId].classList.remove('hidden');
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

  // 出題中なら表示を更新
  if (!screens.quizScreen.classList.contains('hidden')) {
    displayQuestion();
  }
  if (!screens.resultScreen.classList.contains('hidden')) {
    displayResult(currentIndex, null);
  }
}

function updateFuriganaUI() {
  var track = document.getElementById('furiganaTrack');
  var status = document.getElementById('furiganaStatus');
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

/* ========== テキスト取得（ふりがなON/OFF対応） ========== */
function getText(item, field) {
  if (furiganaOn && item[field + '_furigana']) {
    return item[field + '_furigana'];
  }
  return item[field] || '';
}

function getChoiceText(item, index) {
  if (furiganaOn && item.choices_furigana && item.choices_furigana[index]) {
    return item.choices_furigana[index];
  }
  return item.choices[index] || '';
}

/* ========== 科目リスト生成 ========== */
function buildSubjectList() {
  var subjectMap = {};
  allQuestions.forEach(function(q) {
    var subj = q.subject;
    if (!subjectMap[subj]) {
      subjectMap[subj] = 0;
    }
    subjectMap[subj]++;
  });

  var listEl = document.getElementById('subjectList');
  listEl.innerHTML = '';

  var index = 1;
  Object.keys(subjectMap).forEach(function(subj) {
    var count = subjectMap[subj];
    var li = document.createElement('li');
    li.innerHTML =
      '<div class="subject-item" onclick="startBySubject(\'' + subj.replace(/'/g, "\\'") + '\')">' +
        '<div class="subject-badge">' + index + '</div>' +
        '<div class="subject-name">' + subj + '</div>' +
        '<div class="subject-count">' + count + '問</div>' +
      '</div>';
    listEl.appendChild(li);
    index++;
  });
}

/* ========== 出題モード：全問 ========== */
function startExam(examNumber) {
  quizQuestions = allQuestions.slice();
  currentIndex = 0;
  correctCount = 0;
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
  shuffleArray(quizQuestions);
  currentIndex = 0;
  correctCount = 0;
  showScreen('quizScreen');
  displayQuestion();
}

/* ========== 出題モード：科目別 ========== */
function showSubjectSelect() {
  showScreen('subjectSelect');
}

function startBySubject(subjectName) {
  quizQuestions = allQuestions.filter(function(q) {
    return q.subject === subjectName;
  });
  shuffleArray(quizQuestions);
  currentIndex = 0;
  correctCount = 0;
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
  document.getElementById('quizProgressText').textContent =
    (currentIndex + 1) + ' / ' + total;
  var pct = Math.round(((currentIndex + 1) / total) * 100);
  document.getElementById('quizProgressFill').style.width = pct + '%';

  // 問番号・科目（q.id を使用）
  document.getElementById('quizNumber').textContent = '問' + q.id;
  document.getElementById('quizSubject').textContent = getText(q, 'subject');

  // 設問文
  document.getElementById('quizQuestion').textContent = getText(q, 'question');

  // 選択肢
  var listEl = document.getElementById('choicesList');
  listEl.innerHTML = '';

  q.choices.forEach(function(choice, i) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.className = 'choice-button';

    // 画像選択肢（問49用）かどうかチェック
    if (typeof choice === 'object' && choice.type === 'image') {
      btn.classList.add('image-choice');
      btn.innerHTML =
        '<span class="choice-number">' + (i + 1) + '</span>' +
        '<img src="' + choice.src + '" alt="' + (choice.alt || '選択肢' + (i + 1)) + '">';
    } else {
      var text = getChoiceText(q, i);
      btn.innerHTML =
        '<span class="choice-number">' + (i + 1) + '</span>' +
        '<span class="choice-text">' + text + '</span>';
    }

    btn.addEventListener('click', function() {
      selectAnswer(i + 1);
    });

    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

/* ========== 回答選択 ========== */
function selectAnswer(selected) {
  var q = quizQuestions[currentIndex];
  var isCorrect = (selected === q.answer);

  if (isCorrect) {
    correctCount++;
  }

  displayResult(currentIndex, isCorrect);
  showScreen('resultScreen');
}

/* ========== 正誤画面表示 ========== */
function displayResult(qIndex, isCorrect) {
  var q = quizQuestions[qIndex];

  // ○×アイコン
  var iconEl = document.getElementById('resultIcon');
  var textEl = document.getElementById('resultText');

  if (isCorrect === null) {
    // ふりがな切り替え時の再表示
  } else if (isCorrect) {
    iconEl.textContent = '⭕';
    textEl.textContent = '正解！';
    textEl.className = 'result-text correct';
  } else {
    iconEl.textContent = '❌';
    textEl.textContent = '不正解…';
    textEl.className = 'result-text incorrect';
  }

  // 正解番号
  document.getElementById('resultAnswer').textContent = q.answer;

  // 解説
  document.getElementById('resultExplanation').textContent =
    getText(q, 'explanation');

  // 最後の問題なら「次へ」を「結果を見る」に変更
  var nextBtn = document.getElementById('nextButton');
  if (currentIndex >= quizQuestions.length - 1) {
    nextBtn.textContent = '結果を見る 🏆';
  } else {
    nextBtn.textContent = '次へ ▶';
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

  document.getElementById('summaryScore').textContent = correctCount;
  document.getElementById('summaryTotal').textContent = '/ ' + total + '問中';
  document.getElementById('summaryBarFill').style.width = pct + '%';

  // メッセージとエモジ
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

  document.getElementById('summaryEmoji').textContent = emoji;
  document.getElementById('summaryMessage').textContent =
    message + '（正答率 ' + pct + '%）';

  showScreen('summaryScreen');
}
