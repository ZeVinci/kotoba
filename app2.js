// ============ ÉTAT GLOBAL ============
let reviseWords  = [];
let reviseMode   = 'k-fr';
let currentWord  = null;
let revealed     = false;
let scoreGood    = 0;
let scoreTotal   = 0;

// Sélections actives (Set vide = "Tous")
const learnSel = { niveauTopic: new Set(), section: new Set() };
const revSel   = { niveauTopic: new Set(), section: new Set() };

// ============ FAVORIS (mots marqués) ============
// Persistance via localStorage, clé basée sur le CONTENU du mot (k|h)
// → survit à la régénération de vocab2.js (l'ordre du tableau n'a pas d'importance)
const FAV_KEY = 'kotoba-favoris';
let favs = loadFavs();
let learnFavsOnly = false;

function wordId(w) { return w.k + '|' + w.h; }

function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function saveFavs() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); }
  catch (e) {}
}
function isFav(w)    { return favs.has(wordId(w)); }
function toggleFav(w) {
  const id = wordId(w);
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  saveFavs();
}

// Export → télécharge kotoba-favoris.json
function exportFavs() {
  var blob = new Blob([JSON.stringify([...favs], null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kotoba-favoris.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Import → replace=true remplace, replace=false fusionne
function importFavsFromText(text, replace) {
  var arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error('Format invalide');
  favs = replace ? new Set(arr) : new Set([...favs, ...arr]);
  saveFavs();
}

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
  // Chips Niveau+Topic fusionnés
  buildChips(prefix + '-chips-topic', allNTKeys(), sel.niveauTopic, onChange);

  // Chips Section : exclure "aucune", ne montrer que les vraies sections
  var sections = unique(VOCAB.map(function(v) { return v.section; }))
    .filter(function(s) { return s !== 'aucune'; })
    .sort();
  buildChips(prefix + '-chips-section', sections, sel.section, onChange);
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
  if (learnFavsOnly) words = words.filter(isFav);
  var hideJP = document.getElementById('hide-jp').checked;
  var hideFR = document.getElementById('hide-fr').checked;

  document.getElementById('learn-count').textContent = words.length + ' mot(s) affiché(s)';

  var tbody = document.getElementById('learn-tbody');
  tbody.innerHTML = '';

  if (words.length === 0) {
    var msg = learnFavsOnly ? 'Aucun mot marqué pour ces filtres.' : 'Aucun mot pour ces filtres.';
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--smoke)">' + msg + '</td></tr>';
    return;
  }

  words.forEach(function(w) {
    var tr = document.createElement('tr');

    // Colonne étoile (favori)
    var tdStar = document.createElement('td');
    tdStar.className = 'td-star';
    var star = document.createElement('button');
    star.className = 'star-btn' + (isFav(w) ? ' on' : '');
    star.textContent = isFav(w) ? '★' : '☆';
    star.setAttribute('aria-label', 'Marquer / démarquer ce mot');
    star.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleFav(w);
      var nowFav = isFav(w);
      star.classList.toggle('on', nowFav);
      star.textContent = nowFav ? '★' : '☆';
      // En mode "favoris uniquement", la ligne démarquée doit disparaître
      if (learnFavsOnly && !nowFav) renderLearnTable();
    });
    tdStar.appendChild(star);
    tr.appendChild(tdStar);

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

// ---- Contrôles favoris ----
document.getElementById('fav-only').addEventListener('change', function(e) {
  learnFavsOnly = e.target.checked;
  renderLearnTable();
});

document.getElementById('fav-export').addEventListener('click', function() {
  if (favs.size === 0) { alert('Aucun mot marqué à exporter.'); return; }
  exportFavs();
});

document.getElementById('fav-import').addEventListener('click', function() {
  document.getElementById('fav-import-file').click();
});

document.getElementById('fav-import-file').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var replace = confirm(
        'Importer les favoris :\n\n' +
        'OK = REMPLACER la liste actuelle\n' +
        'Annuler = FUSIONNER avec la liste actuelle'
      );
      importFavsFromText(reader.result, replace);
      renderLearnTable();
      alert('Import réussi — ' + favs.size + ' mot(s) marqué(s) au total.');
    } catch (err) {
      alert('Échec de l\'import : fichier JSON invalide.');
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // permet de réimporter le même fichier ensuite
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
