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
function isFav(w) { return favs.has(wordId(w)); }
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
// Extraire niveau / topic d'une clé composite (le niveau peut contenir un espace, ex "A2/B1")
function ntNiveauOf(key) { return key.slice(0, key.lastIndexOf(' ')); }
function ntTopicOf(key)  { return key.slice(key.lastIndexOf(' ') + 1); }

// Tous les niveaux distincts, triés
function allNiveaux() {
  return unique(VOCAB.map(function(v) { return v.niveau; })).sort();
}

// Toutes les paires { key, niveau, topic } distinctes, triées par niveau puis topic
function allNT() {
  var map = {};
  VOCAB.forEach(function(v) {
    var k = ntKey(v);
    if (!map[k]) map[k] = { key: k, niveau: v.niveau, topic: v.topic };
  });
  return Object.keys(map).map(function(k) { return map[k]; }).sort(function(a, b) {
    if (a.niveau !== b.niveau) return a.niveau.localeCompare(b.niveau);
    return a.topic.localeCompare(b.topic, undefined, { numeric: true });
  });
}

// Sections réelles (hors 'aucune') disponibles pour la sélection courante
function sectionsForSelection(sel) {
  var set = {};
  VOCAB.forEach(function(v) {
    if (sel.niveau.size > 0 && !sel.niveau.has(v.niveau)) return;
    if (sel.niveauTopic.size > 0 && !sel.niveauTopic.has(ntKey(v))) return;
    if (v.section !== 'aucune') set[v.section] = true;
  });
  return Object.keys(set).sort();
}

// Retirer les sections sélectionnées qui ne sont plus disponibles
function pruneSections(sel) {
  var avail = new Set(sectionsForSelection(sel));
  [...sel.section].forEach(function(s) { if (!avail.has(s)) sel.section.delete(s); });
}

// Filtrage :
// - niveau      : filtre sur le niveau (vide = tous)
// - niveauTopic : filtre sur la clé composite (vide = tous)
// - section     : ignorée pour les mots sans section ('aucune')
function filterVocab(sel) {
  return VOCAB.filter(function(v) {
    if (sel.niveau.size > 0 && !sel.niveau.has(v.niveau)) return false;
    if (sel.niveauTopic.size > 0 && !sel.niveauTopic.has(ntKey(v))) return false;
    if (v.section === 'aucune') return true;
    if (sel.section.size > 0 && !sel.section.has(v.section)) return false;
    return true;
  });
}

// ============ CHIPS (cascade) ============
// items : tableau de { value, label }
function buildChipGroup(containerId, items, selSet, onChange) {
  var container = document.getElementById(containerId);
  if (!container) return;
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

// Révélation progressive : Niveau → Topic → Section
function renderFilters(prefix, sel, onChange) {
  // 1. Niveau (toujours visible)
  buildChipGroup(
    prefix + '-chips-niveau',
    allNiveaux().map(function(n) { return { value: n, label: n }; }),
    sel.niveau,
    function() {
      // Cascade : retirer les topics dont le niveau n'est plus sélectionné
      [...sel.niveauTopic].forEach(function(k) {
        if (sel.niveau.size > 0 && !sel.niveau.has(ntNiveauOf(k))) sel.niveauTopic.delete(k);
      });
      pruneSections(sel);
      renderFilters(prefix, sel, onChange);
      onChange();
    }
  );

  // 2. Topic (visible uniquement si ≥ 1 niveau sélectionné)
  var topicGroup = document.getElementById(prefix + '-group-topic');
  if (sel.niveau.size === 0) {
    if (topicGroup) topicGroup.style.display = 'none';
  } else {
    if (topicGroup) topicGroup.style.display = '';
    var topics = allNT().filter(function(o) { return sel.niveau.has(o.niveau); });
    // Préfixer par le niveau seulement si plusieurs niveaux sont sélectionnés
    var multi = sel.niveau.size > 1;
    buildChipGroup(
      prefix + '-chips-topic',
      topics.map(function(o) {
        return { value: o.key, label: multi ? (o.niveau + ' ' + o.topic) : o.topic };
      }),
      sel.niveauTopic,
      function() {
        pruneSections(sel);
        renderFilters(prefix, sel, onChange);
        onChange();
      }
    );
  }

  // 3. Section (visible uniquement si ≥ 1 topic sélectionné ET de vraies sections existent)
  var sectionGroup = document.getElementById(prefix + '-group-section');
  var sections = sectionsForSelection(sel);
  if (sel.niveauTopic.size === 0 || sections.length === 0) {
    if (sectionGroup) sectionGroup.style.display = 'none';
  } else {
    if (sectionGroup) sectionGroup.style.display = '';
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
    var msg = learnFavsOnly
      ? 'Aucun favori pour ces filtres.'
      : 'Aucun mot pour ces filtres.';
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:30px;color:var(--smoke)">' + msg + '</td></tr>';
    return;
  }

  words.forEach(function(w) {
    var tr = document.createElement('tr');

    // Colonne étoile (favori)
    var tdStar = document.createElement('td');
    tdStar.className = 'td-star';
    var starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'star-btn' + (isFav(w) ? ' on' : '');
    starBtn.textContent = isFav(w) ? '★' : '☆';
    starBtn.setAttribute('aria-label', 'Marquer comme favori');
    starBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleFav(w);
      var on = isFav(w);
      starBtn.classList.toggle('on', on);
      starBtn.textContent = on ? '★' : '☆';
      if (learnFavsOnly) renderLearnTable(); // le mot disparaît s'il est dé-favorisé
    });
    tdStar.appendChild(starBtn);
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

// --- Contrôles favoris (écran Liste) ---
document.getElementById('fav-only').addEventListener('change', function() {
  learnFavsOnly = this.checked;
  renderLearnTable();
});
document.getElementById('fav-export').addEventListener('click', exportFavs);
document.getElementById('fav-import').addEventListener('click', function() {
  document.getElementById('fav-import-file').click();
});
document.getElementById('fav-import-file').addEventListener('change', function(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var replace = confirm(
        'Importer les favoris :\n\n' +
        'OK = REMPLACER tes favoris actuels\n' +
        'Annuler = FUSIONNER avec tes favoris actuels'
      );
      importFavsFromText(reader.result, replace);
      renderLearnTable();
      alert('Favoris importés — ' + favs.size + ' au total.');
    } catch (err) {
      alert('Échec de l\'import : ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // permet de réimporter le même fichier
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

// ============ GRAMMAIRE ============
// Thèmes sélectionnés (Set vide = tous)
const gramSel = new Set();

function gramThemeLabel(g) {
  // ex. "B1-1 T2"
  return g.niveau + ' T' + g.theme_num;
}

function initGramChips() {
  var container = document.getElementById('gram-chips-theme');
  container.innerHTML = '';

  var allChip = document.createElement('button');
  allChip.className = 'chip' + (gramSel.size === 0 ? ' active' : '');
  allChip.textContent = 'Tous';
  allChip.addEventListener('click', function () {
    gramSel.clear();
    initGramChips();
    renderGramList();
  });
  container.appendChild(allChip);

  GRAMMAIRE.forEach(function (g) {
    var chip = document.createElement('button');
    chip.className = 'chip' + (gramSel.has(g.id) ? ' active' : '');
    chip.textContent = gramThemeLabel(g);
    chip.addEventListener('click', function () {
      if (gramSel.has(g.id)) gramSel.delete(g.id);
      else gramSel.add(g.id);
      initGramChips();
      renderGramList();
    });
    container.appendChild(chip);
  });
}

function renderGramList() {
  var wrap = document.getElementById('gram-list');
  wrap.innerHTML = '';

  var themes = GRAMMAIRE.filter(function (g) {
    return gramSel.size === 0 || gramSel.has(g.id);
  });

  if (themes.length === 0) {
    wrap.innerHTML = '<div class="gram-empty">Aucun thème pour ces filtres.</div>';
    return;
  }

  themes.forEach(function (g) {
    var section = document.createElement('div');
    section.className = 'gram-theme';

    var head = document.createElement('div');
    head.className = 'gram-theme-head';
    var tag = document.createElement('span');
    tag.className = 'gram-theme-tag';
    tag.textContent = gramThemeLabel(g);
    var title = document.createElement('span');
    title.className = 'gram-theme-title';
    title.textContent = g.titre_jp || '';
    head.appendChild(tag);
    head.appendChild(title);
    section.appendChild(head);

    g.points.forEach(function (pt) {
      var item = document.createElement('div');
      item.className = 'gram-point';

      var ph = document.createElement('button');
      ph.className = 'gram-point-head';
      ph.type = 'button';

      var num = document.createElement('span');
      num.className = 'gram-point-num';
      num.textContent = pt.num;

      var txt = document.createElement('span');
      txt.className = 'gram-point-text';
      var jp = document.createElement('span');
      jp.className = 'gram-point-jp';
      jp.textContent = pt.jp;
      var fr = document.createElement('span');
      fr.className = 'gram-point-fr';
      fr.textContent = pt.fr;
      txt.appendChild(jp);
      txt.appendChild(fr);

      var arrow = document.createElement('span');
      arrow.className = 'gram-point-arrow';
      arrow.textContent = '\u25be'; // ▾

      ph.appendChild(num);
      ph.appendChild(txt);
      ph.appendChild(arrow);

      var body = document.createElement('div');
      body.className = 'gram-point-body';
      body.innerHTML = pt.html;   // contenu généré par convert_grammaire.py
      body.style.display = 'none';

      ph.addEventListener('click', function () {
        var open = item.classList.toggle('open');
        body.style.display = open ? 'block' : 'none';
      });

      item.appendChild(ph);
      item.appendChild(body);
      section.appendChild(item);
    });

    wrap.appendChild(section);
  });
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
    case 'goto-gram':
      initGramChips();
      renderGramList();
      showScreen('gram-screen');
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
