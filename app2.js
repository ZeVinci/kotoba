// ============ ÉTAT GLOBAL ============
let reviseWords  = [];
let reviseMode   = 'k-fr';
let currentWord  = null;
let revealed     = false;
let scoreGood    = 0;
let scoreTotal   = 0;

// Sélections actives pour chaque dimension (Set vide = "Tous")
const learnSel = { topic: new Set(), section: new Set() };
const revSel   = { topic: new Set(), section: new Set() };

// ============ NAVIGATION ============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============ UTILITAIRES ============
function unique(arr) { return [...new Set(arr)].sort(); }

function filterVocab(sel) {
  return VOCAB.filter(v =>
    (sel.topic.size   === 0 || sel.topic.has(v.topic))   &&
    (sel.section.size === 0 || sel.section.has(v.section))
  );
}

// ============ CHIPS MULTI-SÉLECTION ============
function buildChips(containerId, values, selSet, onChange) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.className = 'chip' + (selSet.size === 0 ? ' active' : '');
  allChip.textContent = 'Tous';
  allChip.addEventListener('click', () => {
    selSet.clear();
    buildChips(containerId, values, selSet, onChange);
    onChange();
  });
  container.appendChild(allChip);

  values.forEach(val => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (selSet.has(val) ? ' active' : '');
    chip.textContent = val;
    chip.addEventListener('click', () => {
      if (selSet.has(val)) selSet.delete(val);
      else selSet.add(val);
      buildChips(containerId, values, selSet, onChange);
      onChange();
    });
    container.appendChild(chip);
  });
}

function initChips(prefix, sel, onChange) {
  buildChips(`${prefix}-chips-topic`,   unique(VOCAB.map(v => v.topic)),   sel.topic,   onChange);
  buildChips(`${prefix}-chips-section`, unique(VOCAB.map(v => v.section)), sel.section, onChange);
}

// ============ ACCUEIL ============
(function initHome() {
  const topics = unique(VOCAB.map(v => v.topic)).join(', ');
  document.getElementById('home-stats').textContent =
    VOCAB.length + ' mots · Topics : ' + topics;
})();

// ============ MODE APPRENDRE ============
let learnFilterOpen = false;
document.getElementById('filter-toggle-btn').addEventListener('click', () => {
  learnFilterOpen = !learnFilterOpen;
  const panel = document.getElementById('learn-filter-panel');
  panel.style.display = learnFilterOpen ? 'flex' : 'none';
  document.getElementById('filter-toggle-btn').classList.toggle('active', learnFilterOpen);
});

function renderLearnTable() {
  const words  = filterVocab(learnSel);
  const hideJP = document.getElementById('hide-jp').checked;
  const hideFR = document.getElementById('hide-fr').checked;

  document.getElementById('th-jp').style.display = '';
  document.getElementById('th-fr').style.display = '';
  document.getElementById('learn-count').textContent = words.length + ' mot(s) affiché(s)';

  const tbody = document.getElementById('learn-tbody');
  tbody.innerHTML = '';

  if (words.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:30px;color:var(--smoke)">Aucun mot pour ces filtres.</td></tr>';
    return;
  }

  words.forEach(w => {
    const tr = document.createElement('tr');

    // --- Colonne Japonais ---
    const tdJP = document.createElement('td');
    tdJP.className = 'td-jp';

    const kanji = w.k || w.h;
    const hira  = (w.h && w.h !== w.k) ? w.h : '';

    if (hideJP) {
      // Bloc masqué, tap pour révéler
      const block = document.createElement('div');
      block.className = 'cell-hidden';
      block.setAttribute('role', 'button');
      const k = document.createElement('span'); k.className = 'jp-kanji'; k.textContent = kanji;
      block.appendChild(k);
      if (hira) { const h = document.createElement('span'); h.className = 'jp-hira'; h.textContent = hira; block.appendChild(h); }
      block.addEventListener('click', function(e) {
        e.stopPropagation();
        block.classList.remove('cell-hidden');
        block.classList.add('cell-revealed');
      });
      tdJP.appendChild(block);
    } else {
      const k = document.createElement('span'); k.className = 'jp-kanji'; k.textContent = kanji;
      tdJP.appendChild(k);
      if (hira) { const h = document.createElement('span'); h.className = 'jp-hira'; h.textContent = hira; tdJP.appendChild(h); }
    }
    tr.appendChild(tdJP);

    // --- Colonne Français ---
    const tdFR = document.createElement('td');
    tdFR.className = 'td-fr';

    if (hideFR) {
      const span = document.createElement('span');
      span.className = 'cell-hidden';
      span.textContent = w.fr;
      span.setAttribute('role', 'button');
      span.addEventListener('click', function(e) {
        e.stopPropagation();
        span.classList.remove('cell-hidden');
        span.classList.add('cell-revealed');
      });
      tdFR.appendChild(span);
    } else {
      tdFR.textContent = w.fr;
    }
    tr.appendChild(tdFR);

    tbody.appendChild(tr);
  });
}

['hide-jp', 'hide-fr'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', renderLearnTable);
});

// ============ MODE RÉVISION SETUP ============
function updateRevCount() {
  var n = filterVocab(revSel).length;
  document.getElementById('rev-count').textContent = n + ' mot(s) sélectionné(s)';
}

function startRevise() {
  reviseWords = filterVocab(revSel);
  if (reviseWords.length === 0) { alert('Aucun mot ne correspond aux filtres.'); return; }
  reviseMode = document.querySelector('input[name="rev-mode"]:checked').value;
  scoreGood = scoreTotal = 0;
  updateScore();
  showScreen('revise-game-screen');
  nextWord();
}

// ============ MODE RÉVISION JEU ============
function nextWord() {
  currentWord = reviseWords[Math.floor(Math.random() * reviseWords.length)];
  revealed = false;

  var pK  = document.getElementById('prompt-k');
  var pH  = document.getElementById('prompt-h');
  var pFr = document.getElementById('prompt-fr');
  var aK  = document.getElementById('answer-k');
  var aH  = document.getElementById('answer-h');
  var aFr = document.getElementById('answer-fr');

  [pK, pH, pFr, aK, aH, aFr].forEach(function(el) { el.textContent = ''; });
  document.getElementById('answer-block').style.display = 'none';
  document.getElementById('card-divider').style.display = 'none';
  document.getElementById('answer-zone').style.display  = 'none';
  document.getElementById('tap-hint').style.display     = 'block';

  var kanji = currentWord.k || currentWord.h;
  var hira  = (currentWord.h && currentWord.h !== currentWord.k) ? currentWord.h : '';

  if (reviseMode === 'k-fr') {
    pK.textContent  = kanji;
    aH.textContent  = hira;
    aFr.textContent = currentWord.fr;
  } else if (reviseMode === 'jp-fr') {
    pK.textContent  = kanji;
    pH.textContent  = hira;
    aFr.textContent = currentWord.fr;
  } else {
    pFr.textContent = currentWord.fr;
    aK.textContent  = kanji;
    aH.textContent  = hira;
  }
}

function revealAnswer() {
  if (revealed) return;
  revealed = true;
  document.getElementById('answer-block').style.display = 'flex';
  document.getElementById('card-divider').style.display = 'block';
  document.getElementById('tap-hint').style.display     = 'none';
  document.getElementById('answer-zone').style.display  = 'grid';
}

function markAnswer(correct) {
  scoreTotal++;
  if (correct) scoreGood++;
  updateScore();
  nextWord();
}

function updateScore() {
  document.getElementById('score-good').textContent  = scoreGood;
  document.getElementById('score-total').textContent = scoreTotal;
  var pct = scoreTotal === 0 ? '—' : Math.round(scoreGood / scoreTotal * 100) + '%';
  document.getElementById('pct-badge').textContent = pct;
}

// ============ EVENT DELEGATION ============
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.dataset.action;
  switch (action) {
    case 'goto-home':         showScreen('home-screen'); break;
    case 'goto-learn':
      initChips('learn', learnSel, renderLearnTable);
      renderLearnTable();
      showScreen('learn-screen');
      break;
    case 'goto-revise-setup':
      initChips('rev', revSel, updateRevCount);
      updateRevCount();
      showScreen('revise-setup-screen');
      break;
    case 'start-revise':  startRevise(); break;
    case 'stop-revise':   showScreen('home-screen'); break;
    case 'mark-right':    markAnswer(true);  break;
    case 'mark-wrong':    markAnswer(false); break;
  }
});

document.getElementById('card').addEventListener('click', revealAnswer);
document.getElementById('card').addEventListener('keydown', function(e) {
  if (e.key === ' ' || e.key === 'Enter') revealAnswer();
});