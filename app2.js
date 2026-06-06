// ============ ÉTAT GLOBAL ============
let reviseWords  = [];
let reviseMode   = 'k-fr';
let currentWord  = null;
let revealed     = false;
let scoreGood    = 0;
let scoreTotal   = 0;

// Sélections actives (Set vide = "Tous")
const learnSel = { niveau: new Set(), niveauTopic: new Set(), section: new Set() };
const revSel   = { niveau: new Set(), niveauTopic: new Set(), section: new Set() };

// ============ NAVIGATION ============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============ UTILITAIRES ============
function unique(arr) { return [...new Set(arr)]; }

// Clé composite "Niveau Topic"
function ntKey(v) { return v.niveau + ' ' + v.topic; }

// Toutes les clés composites triées, en conservant niveau et topic séparément pour le tri
function allNTKeys() {
  var map = {};
  VOCAB.forEach(function(v) {
    var k = ntKey(v);
    if (!map[k]) map[k] = { niveau: v.niveau, topic: v.topic };
  });
  return Object.keys(map).sort(function(a, b) {
    var pa = map[a], pb = map[b];
    if (pa.niveau !== pb.niveau) return pa.niveau.localeCompare(pb.niveau);
    return pa.topic.localeCompare(pb.topic);
  });
}

// Filtrage :
// - niveauTopic : filtre sur la clé composite (vide = tous)
// - section : filtre uniquement les mots qui ONT une section (section !== 'aucune')
//             les mots sans section passent toujours si leur niveauTopic est ok
function filterVocab(sel) {
  return VOCAB.filter(function(v) {
    // 0. Filtre niveau seul
    if (sel.niveau.size > 0 && !sel.niveau.has(v.niveau)) return false;
    // 1. Filtre niveau+topic
    if (sel.niveauTopic.size > 0 && !sel.niveauTopic.has(ntKey(v))) return false;
    // 2. Filtre section : ignoré pour les mots sans section
    if (v.section === 'aucune') return true;
    if (sel.section.size > 0 && !sel.section.has(v.section)) return false;
    return true;
  });
}

// ============ CHIPS ============
function buildChips(containerId, values, selSet, onChange) {
  var container = document.getElementById(containerId);
  container.innerHTML = '';

  var allChip = document.createElement('button');
  allChip.className = 'chip' + (selSet.size === 0 ? ' active' : '');
  allChip.textContent = 'Tous';
  allChip.addEventListener('click', function() {
    selSet.clear();
    buildChips(containerId, values, selSet, onChange);
    onChange();
  });
  container.appendChild(allChip);

  values.forEach(function(val) {
    var chip = document.createElement('button');
    chip.className = 'chip' + (selSet.has(val) ? ' active' : '');
    chip.textContent = val;
    chip.addEventListener('click', function() {
      if (selSet.has(val)) selSet.delete(val);
      else selSet.add(val);
      buildChips(containerId, values, selSet, onChange);
      onChange();
    });
    container.appendChild(chip);
  });
}

function initChips(prefix, sel, onChange) {
  // --- Chips Niveau (toujours visibles) ---
  var niveaux = unique(VOCAB.map(function(v) { return v.niveau; })).sort();
  buildChips(prefix + '-chips-niveau', niveaux, sel.niveau, function() {
    // Quand le niveau change : réinitialiser topic et section si incohérents
    sel.niveauTopic.forEach(function(k) {
      var found = VOCAB.some(function(v) {
        return ntKey(v) === k && (sel.niveau.size === 0 || sel.niveau.has(v.niveau));
      });
      if (!found) sel.niveauTopic.delete(k);
    });
    sel.section.clear();
    refreshTopicAndSection(prefix, sel, onChange);
    onChange();
  });

  refreshTopicAndSection(prefix, sel, onChange);
}

function refreshTopicAndSection(prefix, sel, onChange) {
  var groupTopic   = document.getElementById(prefix + '-group-topic');
  var groupSection = document.getElementById(prefix + '-group-section');

  // --- Topics : filtrés par niveau actif ---
  var vocabForNiveau = sel.niveau.size > 0
    ? VOCAB.filter(function(v) { return sel.niveau.has(v.niveau); })
    : VOCAB;

  var ntKeys = (function() {
    var map = {};
    vocabForNiveau.forEach(function(v) {
      var k = ntKey(v);
      if (!map[k]) map[k] = { niveau: v.niveau, topic: v.topic };
    });
    return Object.keys(map).sort(function(a, b) {
      var pa = map[a], pb = map[b];
      if (pa.niveau !== pb.niveau) return pa.niveau.localeCompare(pb.niveau);
      return pa.topic.localeCompare(pb.topic);
    });
  })();

  if (sel.niveau.size > 0) {
    groupTopic.style.display = '';
    buildChips(prefix + '-chips-topic', ntKeys, sel.niveauTopic, function() {
      sel.section.clear();
      refreshSection(prefix, sel, onChange);
      onChange();
    });
  } else {
    groupTopic.style.display = 'none';
    sel.niveauTopic.clear();
  }

  refreshSection(prefix, sel, onChange);
}

function refreshSection(prefix, sel, onChange) {
  var groupSection = document.getElementById(prefix + '-group-section');

  if (sel.niveauTopic.size > 0) {
    // Sections présentes dans les topics sélectionnés
    var sections = unique(
      VOCAB
        .filter(function(v) { return sel.niveauTopic.has(ntKey(v)) && v.section !== 'aucune'; })
        .map(function(v) { return v.section; })
    ).sort();

    if (sections.length > 0) {
      groupSection.style.display = '';
      buildChips(prefix + '-chips-section', sections, sel.section, onChange);
    } else {
      groupSection.style.display = 'none';
      sel.section.clear();
    }
  } else {
    groupSection.style.display = 'none';
    sel.section.clear();
  }
}

// ============ ACCUEIL ============
(function initHome() {
  var niveaux = unique(VOCAB.map(function(v) { return v.niveau; })).sort().join(', ');
  document.getElementById('home-stats').textContent =
    VOCAB.length + ' mots · Niveaux : ' + niveaux;
})();

// ============ MODE APPRENDRE ============
var learnFilterOpen = false;
document.getElementById('filter-toggle-btn').addEventListener('click', function() {
  learnFilterOpen = !learnFilterOpen;
  var panel = document.getElementById('learn-filter-panel');
  panel.style.display = learnFilterOpen ? 'flex' : 'none';
  document.getElementById('filter-toggle-btn').classList.toggle('active', learnFilterOpen);
});

function renderLearnTable() {
  var words  = filterVocab(learnSel);
  var hideJP = document.getElementById('hide-jp').checked;
  var hideFR = document.getElementById('hide-fr').checked;

  document.getElementById('learn-count').textContent = words.length + ' mot(s) affiché(s)';

  var tbody = document.getElementById('learn-tbody');
  tbody.innerHTML = '';

  if (words.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:30px;color:var(--smoke)">Aucun mot pour ces filtres.</td></tr>';
    return;
  }

  words.forEach(function(w) {
    var tr = document.createElement('tr');

    // Colonne Japonais
    var tdJP = document.createElement('td');
    tdJP.className = 'td-jp';
    var kanji = w.k || w.h;
    var hira  = (w.h && w.h !== w.k) ? w.h : '';

    if (hideJP) {
      var block = document.createElement('div');
      block.className = 'cell-hidden';
      block.setAttribute('role', 'button');
      var spanK = document.createElement('span'); spanK.className = 'jp-kanji'; spanK.textContent = kanji;
      block.appendChild(spanK);
      if (hira) { var spanH = document.createElement('span'); spanH.className = 'jp-hira'; spanH.textContent = hira; block.appendChild(spanH); }
      block.addEventListener('click', function(e) {
        e.stopPropagation();
        block.classList.remove('cell-hidden');
        block.classList.add('cell-revealed');
      });
      tdJP.appendChild(block);
    } else {
      var spanK2 = document.createElement('span'); spanK2.className = 'jp-kanji'; spanK2.textContent = kanji;
      tdJP.appendChild(spanK2);
      if (hira) { var spanH2 = document.createElement('span'); spanH2.className = 'jp-hira'; spanH2.textContent = hira; tdJP.appendChild(spanH2); }
    }
    tr.appendChild(tdJP);

    // Colonne Français
    var tdFR = document.createElement('td');
    tdFR.className = 'td-fr';
    if (hideFR) {
      var span = document.createElement('span');
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
  document.getElementById('rev-count').textContent =
    filterVocab(revSel).length + ' mot(s) sélectionné(s)';
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
  switch (el.dataset.action) {
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
