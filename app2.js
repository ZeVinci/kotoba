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

// Niveau extrait d'une clé composite ("A2/B1 T8" -> "A2/B1")
function ntNiveauOf(key) { return key.substring(0, key.lastIndexOf(' ')); }

// Niveaux distincts, triés
function allNiveaux() {
  return unique(VOCAB.map(function(v) { return v.niveau; })).sort();
}

// Toutes les paires Niveau/Topic distinctes, triées
function allNT() {
  var map = {};
  VOCAB.forEach(function(v) {
    var k = ntKey(v);
    if (!map[k]) map[k] = { key: k, niveau: v.niveau, topic: v.topic };
  });
  return Object.keys(map).map(function(k) { return map[k]; }).sort(function(a, b) {
    if (a.niveau !== b.niveau) return a.niveau.localeCompare(b.niveau);
    return a.topic.localeCompare(b.topic);
  });
}

// Sections réelles présentes dans la sélection niveau+topic courante
function sectionsForSelection(sel) {
  var ws = VOCAB.filter(function(v) {
    if (sel.niveau.size > 0 && !sel.niveau.has(v.niveau)) return false;
    if (sel.niveauTopic.size > 0 && !sel.niveauTopic.has(ntKey(v))) return false;
    return true;
  });
  return unique(ws.map(function(v) { return v.section; }))
    .filter(function(s) { return s !== 'aucune'; })
    .sort();
}

// Retire les sections sélectionnées qui ne sont plus présentes dans la sélection
function pruneSections(sel) {
  var avail = new Set(sectionsForSelection(sel));
  [...sel.section].forEach(function(s) { if (!avail.has(s)) sel.section.delete(s); });
}

// Filtrage :
// - niveau : filtre sur le niveau (vide = tous)
// - niveauTopic : filtre sur la clé composite (vide = tous)
// - section : ignorée pour les mots sans section ('aucune')
function filterVocab(sel) {
  return VOCAB.filter(function(v) {
    if (sel.niveau.size > 0 && !sel.niveau.has(v.niveau)) return false;
    if (sel.niveauTopic.size > 0 && !sel.niveauTopic.has(ntKey(v))) return false;
    if (v.section === 'aucune') return true;
    if (sel.section.size > 0 && !sel.section.has(v.section)) return false;
    return true;
  });
}

// ============ CHIPS ============
// items : tableau de { value, label }
function buildChipGroup(containerId, items, selSet, onChange) {
  var container = document.getElementById(containerId);
  container.innerHTML = '';

  var allChip = document.createElement('button');
  allChip.className = 'chip' + (selSet.size === 0 ? ' active' : '');
  allChip.textContent = 'Tous';
  allChip.addEventListener('click', function() {
    selSet.clear();
    onChange();
  });
  container.appendChild(allChip);

  items.forEach(function(it) {
    var chip = document.createElement('button');
    chip.className = 'chip' + (selSet.has(it.value) ? ' active' : '');
    chip.textContent = it.label;
    chip.addEventListener('click', function() {
      if (selSet.has(it.value)) selSet.delete(it.value);
      else selSet.add(it.value);
      onChange();
    });
    container.appendChild(chip);
  });
}

// Révélation progressive : Niveau -> Topic -> Section
function renderFilters(prefix, sel, onChange) {
  // 1. Niveau (toujours visible)
  buildChipGroup(
    prefix + '-chips-niveau',
    allNiveaux().map(function(n) { return { value: n, label: n }; }),
    sel.niveau,
    function() {
      // Cascade : retirer les topics dont le niveau n'est plus sélectionné
      [...sel.niveauTopic].forEach(function(k) {
        if (!sel.niveau.has(ntNiveauOf(k))) sel.niveauTopic.delete(k);
      });
      pruneSections(sel);
      renderFilters(prefix, sel, onChange);
      onChange();
    }
  );

  // 2. Topic (visible seulement si >= 1 niveau sélectionné)
  var topicGroup = document.getElementById(prefix + '-group-topic');
  if (sel.niveau.size === 0) {
    topicGroup.style.display = 'none';
  } else {
    topicGroup.style.display = '';
    var topics = allNT().filter(function(o) { return sel.niveau.has(o.niveau); });
    buildChipGroup(
      prefix + '-chips-topic',
      topics.map(function(o) {
        // Un seul niveau sélectionné : label court ("T1"). Plusieurs : label
        // complet ("B1 T1") pour lever l'ambiguïté quand des numéros de topic
        // se chevauchent entre niveaux (ex. A2/B1 et B1 partagent T1–T5).
        return { value: o.key, label: (sel.niveau.size > 1 ? o.key : o.topic) };
      }),
      sel.niveauTopic,
      function() {
        pruneSections(sel);
        renderFilters(prefix, sel, onChange);
        onChange();
      }
    );
  }

  // 3. Section (visible seulement si >= 1 topic sélectionné ET sections présentes)
  var secGroup = document.getElementById(prefix + '-group-section');
  var sections = sectionsForSelection(sel);
  if (sel.niveauTopic.size === 0 || sections.length === 0) {
    secGroup.style.display = 'none';
  } else {
    secGroup.style.display = '';
    buildChipGroup(
      prefix + '-chips-section',
      sections.map(function(s) { return { value: s, label: s }; }),
      sel.section,
      function() {
        renderFilters(prefix, sel, onChange);
        onChange();
      }
    );
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
      renderFilters('learn', learnSel, renderLearnTable);
      renderLearnTable();
      showScreen('learn-screen');
      break;
    case 'goto-revise-setup':
      renderFilters('rev', revSel, updateRevCount);
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
