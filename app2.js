// ============ ÉTAT ============
let reviseWords = [];
let reviseMode  = 'k-fr';  // 'k-fr' | 'jp-fr' | 'fr-jp'
let currentWord = null;
let revealed    = false;
let scoreGood   = 0;
let scoreTotal  = 0;

// ============ NAVIGATION ============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============ UTILITAIRES ============
function unique(arr) { return [...new Set(arr)].sort(); }

function applyFilters(topicId, sectionId, niveauId) {
  const t = document.getElementById(topicId).value;
  const s = document.getElementById(sectionId).value;
  const n = document.getElementById(niveauId).value;
  return VOCAB.filter(v =>
    (!t || v.topic   === t) &&
    (!s || v.section === s) &&
    (!n || v.niveau  === n)
  );
}

function populateSelect(selectId, values, currentVal) {
  const sel = document.getElementById(selectId);
  const prev = sel.value;
  sel.innerHTML = '';
  const first = document.createElement('option');
  first.value = ''; first.textContent = sel.dataset.placeholder || '—';
  sel.appendChild(first);
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
  sel.value = prev || currentVal || '';
}

function initSelects(topicId, sectionId, niveauId) {
  const placeholder = { topic: 'Tous', section: 'Toutes', niveau: 'Tous' };
  populateSelect(topicId,   unique(VOCAB.map(v => v.topic)),   '');
  populateSelect(sectionId, unique(VOCAB.map(v => v.section)), '');
  populateSelect(niveauId,  unique(VOCAB.map(v => v.niveau)),  '');
  document.getElementById(topicId).options[0].textContent   = 'Tous';
  document.getElementById(sectionId).options[0].textContent = 'Toutes';
  document.getElementById(niveauId).options[0].textContent  = 'Tous';
}

// ============ ACCUEIL ============
(function initHome() {
  const topics = unique(VOCAB.map(v => v.topic)).join(', ');
  document.getElementById('home-stats').textContent =
    `${VOCAB.length} mots — Topics : ${topics}`;
})();

// ============ MODE APPRENDRE ============
let learnFilterOpen = false;
const filterBtn = document.getElementById('filter-toggle-btn');
const filterPanel = document.getElementById('learn-filter-panel');

filterBtn.addEventListener('click', () => {
  learnFilterOpen = !learnFilterOpen;
  filterPanel.style.display = learnFilterOpen ? 'block' : 'none';
  filterBtn.classList.toggle('active', learnFilterOpen);
});

function renderLearnTable() {
  const words = applyFilters('learn-f-topic', 'learn-f-section', 'learn-f-niveau');
  const hideK  = document.getElementById('hide-kanji').checked;
  const hideH  = document.getElementById('hide-hira').checked;
  const hideF  = document.getElementById('hide-fr').checked;

  // Headers
  document.getElementById('th-kanji').style.display = hideK ? 'none' : '';
  document.getElementById('th-hira').style.display  = hideH ? 'none' : '';
  document.getElementById('th-fr').style.display    = hideF ? 'none' : '';

  document.getElementById('learn-count').textContent = `${words.length} mot(s) affiché(s)`;

  const tbody = document.getElementById('learn-tbody');
  tbody.innerHTML = '';

  if (words.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--smoke)">
      Aucun mot pour ces filtres.</td></tr>`;
    return;
  }

  words.forEach(w => {
    const tr = document.createElement('tr');

    function makeCell(text, cls, hidden) {
      const td = document.createElement('td');
      td.style.display = hidden ? 'none' : '';
      if (hidden) return td; // colonne entièrement masquée via checkbox header

      const span = document.createElement('span');
      span.textContent = text || '—';
      span.className = cls;
      td.appendChild(span);
      return td;
    }

    function makeHiddenCell(text, cls, hideByHeader) {
      const td = document.createElement('td');
      if (hideByHeader) { td.style.display = 'none'; return td; }

      const span = document.createElement('span');
      span.className = `cell-hidden ${cls}`;
      span.dataset.text = text || '—';
      span.textContent = text || '—'; // text is there but invisible via class
      span.setAttribute('role', 'button');
      span.setAttribute('aria-label', 'Révéler');
      span.addEventListener('click', e => {
        e.stopPropagation();
        span.classList.remove('cell-hidden');
        span.classList.add('cell-revealed', cls);
      });
      td.appendChild(span);
      return td;
    }

    const needRevealK = false; // on cache la colonne via th, pas cellule par cellule
    const needRevealH = false;
    const needRevealF = false;

    // Colonne kanjis
    td_k = makeCell(w.k, 'td-kanji', hideK);

    // Colonne hiragana — si case cochée, colonne disparaît. Sinon affichée
    td_h = makeCell(w.h, 'td-hira', hideH);

    // Colonne français
    td_f = makeCell(w.fr, 'td-fr', hideF);

    tr.appendChild(td_k);
    tr.appendChild(td_h);
    tr.appendChild(td_f);
    tbody.appendChild(tr);
  });
}

// Rendre les cellules cliquables selon les cases à cocher
function renderLearnTableWithReveal() {
  const words = applyFilters('learn-f-topic', 'learn-f-section', 'learn-f-niveau');
  const hideK  = document.getElementById('hide-kanji').checked;
  const hideH  = document.getElementById('hide-hira').checked;
  const hideF  = document.getElementById('hide-fr').checked;

  document.getElementById('th-kanji').style.display = '';
  document.getElementById('th-hira').style.display  = '';
  document.getElementById('th-fr').style.display    = '';

  document.getElementById('learn-count').textContent = `${words.length} mot(s) affiché(s)`;

  const tbody = document.getElementById('learn-tbody');
  tbody.innerHTML = '';

  if (words.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--smoke)">
      Aucun mot pour ces filtres.</td></tr>`;
    return;
  }

  words.forEach(w => {
    const tr = document.createElement('tr');

    function cell(text, cls, hide) {
      const td = document.createElement('td');
      if (!hide) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text || '—';
        td.appendChild(span);
      } else {
        const span = document.createElement('span');
        span.className = `cell-hidden ${cls}`;
        span.textContent = text || '—';
        span.setAttribute('role', 'button');
        span.setAttribute('aria-label', 'Révéler');
        span.addEventListener('click', e => {
          e.stopPropagation();
          span.classList.remove('cell-hidden');
          span.classList.add('cell-revealed');
        });
        td.appendChild(span);
      }
      return td;
    }

    tr.appendChild(cell(w.k,  'td-kanji', hideK));
    tr.appendChild(cell(w.h,  'td-hira',  hideH));
    tr.appendChild(cell(w.fr, 'td-fr',    hideF));
    tbody.appendChild(tr);
  });
}

['learn-f-topic', 'learn-f-section', 'learn-f-niveau',
 'hide-kanji', 'hide-hira', 'hide-fr'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderLearnTableWithReveal);
});

// ============ MODE RÉVISION SETUP ============
function updateRevCount() {
  const n = applyFilters('rev-f-topic', 'rev-f-section', 'rev-f-niveau').length;
  document.getElementById('rev-count').textContent = `${n} mot(s) sélectionné(s)`;
}

['rev-f-topic', 'rev-f-section', 'rev-f-niveau'].forEach(id => {
  document.getElementById(id).addEventListener('change', updateRevCount);
});

function startRevise() {
  reviseWords = applyFilters('rev-f-topic', 'rev-f-section', 'rev-f-niveau');
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

  const pK  = document.getElementById('prompt-k');
  const pH  = document.getElementById('prompt-h');
  const pFr = document.getElementById('prompt-fr');
  const aK  = document.getElementById('answer-k');
  const aH  = document.getElementById('answer-h');
  const aFr = document.getElementById('answer-fr');
  const div = document.getElementById('card-divider');
  const ansBlk = document.getElementById('answer-block');
  const tapHint = document.getElementById('tap-hint');
  const ansZone = document.getElementById('answer-zone');

  // Vider
  [pK, pH, pFr, aK, aH, aFr].forEach(el => el.textContent = '');
  ansBlk.style.display = 'none';
  div.style.display    = 'none';
  ansZone.style.display = 'none';
  tapHint.style.display = 'block';

  if (reviseMode === 'k-fr') {
    // Prompt : kanji seul
    pK.textContent  = currentWord.k || currentWord.h;
    pH.textContent  = '';
    pFr.textContent = '';
    // Answer : simple + français
    aK.textContent  = '';
    aH.textContent  = currentWord.h;
    aFr.textContent = currentWord.fr;

  } else if (reviseMode === 'jp-fr') {
    // Prompt : kanji + simple
    pK.textContent  = currentWord.k || currentWord.h;
    pH.textContent  = currentWord.h;
    pFr.textContent = '';
    // Answer : français
    aK.textContent  = '';
    aH.textContent  = '';
    aFr.textContent = currentWord.fr;

  } else { // fr-jp
    // Prompt : français
    pK.textContent  = '';
    pH.textContent  = '';
    pFr.textContent = currentWord.fr;
    // Answer : kanji + simple
    aK.textContent  = currentWord.k || currentWord.h;
    aH.textContent  = currentWord.h;
    aFr.textContent = '';
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
  const pct = scoreTotal === 0 ? '—' : Math.round(scoreGood / scoreTotal * 100) + '%';
  document.getElementById('pct-badge').textContent = pct;
}

// ============ EVENT DELEGATION ============
document.addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  switch (action) {
    case 'goto-home':
      showScreen('home-screen');
      break;
    case 'goto-learn':
      initSelects('learn-f-topic', 'learn-f-section', 'learn-f-niveau');
      renderLearnTableWithReveal();
      showScreen('learn-screen');
      break;
    case 'goto-revise-setup':
      initSelects('rev-f-topic', 'rev-f-section', 'rev-f-niveau');
      updateRevCount();
      showScreen('revise-setup-screen');
      break;
    case 'start-revise':
      startRevise();
      break;
    case 'stop-revise':
      showScreen('home-screen');
      break;
    case 'mark-right':
      markAnswer(true);
      break;
    case 'mark-wrong':
      markAnswer(false);
      break;
  }
});

// Carte : tap pour révéler
document.getElementById('card').addEventListener('click', revealAnswer);
document.getElementById('card').addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Enter') revealAnswer();
});
