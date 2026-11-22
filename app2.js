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

// ============ VOCABULAIRE PERSO (importé localement) ============
// Persistance locale via localStorage (clé kotoba-perso). Jamais envoyé au serveur.
// Chaque mot perso : { k, h, fr, topic, section, niveau:'Perso' }
//   - thème non renseigné    → topic   = 'Général'
//   - chapitre non renseigné → section = 'aucune' (toujours admis par le filtre Section)
const PERSO_KEY = 'kotoba-perso';
let persoWords = loadPerso();

// Tableau de travail = vocab embarqué (VOCAB) + vocab perso. Toute l'app lit ALL_VOCAB.
let ALL_VOCAB = VOCAB.concat(persoWords);

function loadPerso() {
  try {
    var arr = JSON.parse(localStorage.getItem(PERSO_KEY) || '[]');
    return Array.isArray(arr) ? arr.map(normPerso).filter(Boolean) : [];
  } catch (e) { return []; }
}
function savePerso() {
  try { localStorage.setItem(PERSO_KEY, JSON.stringify(persoWords)); }
  catch (e) { alert('Impossible d\'enregistrer le vocabulaire perso (stockage plein ?).'); }
}

// Normalise / valide une entrée perso ; renvoie null si k, h ou fr manque.
function normPerso(w) {
  if (!w) return null;
  var k  = (w.k  == null ? '' : String(w.k)).trim();
  var h  = (w.h  == null ? '' : String(w.h)).trim();
  var fr = (w.fr == null ? '' : String(w.fr)).trim();
  if (!k || !h || !fr) return null;
  var topic   = (w.topic   == null ? '' : String(w.topic)).trim()   || 'Général';
  var section = (w.section == null ? '' : String(w.section)).trim() || 'aucune';
  return { k: k, h: h, fr: fr, topic: topic, section: section, niveau: 'Perso' };
}

// Dédoublonnage par identité de contenu (k|h) — la dernière occurrence l'emporte.
function dedupePerso(arr) {
  var map = {};
  arr.forEach(function(w) { var n = normPerso(w); if (n) map[n.k + '|' + n.h] = n; });
  return Object.keys(map).map(function(key) { return map[key]; });
}

// Reconstruit ALL_VOCAB après tout changement perso + rafraîchit l'accueil.
// Réinitialise les filtres en cours pour éviter des sélections périmées.
function rebuildVocab() {
  ALL_VOCAB = VOCAB.concat(persoWords);
  [learnSel, revSel].forEach(function(sel) {
    sel.niveau.clear(); sel.niveauTopic.clear(); sel.section.clear();
  });
  renderHomeStats();
}

// --- Parsing CSV / TSV (texte collé ou fichier) ---
function stripBOM(s) { return (s && s.charCodeAt(0) === 0xFEFF) ? s.slice(1) : s; }

// Autodétection du séparateur : tabulation (collage tableur) > point-virgule > virgule.
function detectDelimiter(text) {
  var lines = text.split(/\r\n|\r|\n/);
  var first = '';
  for (var i = 0; i < lines.length; i++) { if (lines[i].trim() !== '') { first = lines[i]; break; } }
  if (first.indexOf('\t') !== -1) return '\t';
  var semi  = (first.match(/;/g) || []).length;
  var comma = (first.match(/,/g) || []).length;
  return semi > comma ? ';' : ',';
}

// Parseur tolérant : "champs entre guillemets", "" échappé, séparateur/saut de ligne dans les guillemets.
function parseDelimited(text, delim) {
  var rows = [], row = [], field = '', q = false, i = 0, n = text.length;
  while (i < n) {
    var c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  row.push(field); rows.push(row);
  return rows.filter(function(r) { return r.some(function(cell) { return cell.trim() !== ''; }); });
}

// Une 1re ligne ressemblant à un en-tête de colonnes est ignorée.
function looksLikeHeader(cells) {
  var j = cells.slice(0, 3).join(' ').toLowerCase();
  return /kanji|kana|hiragana|jap|fran|lecture|trad|word|mot|th[eè]me|chap/.test(j);
}

// Texte (collé ou fichier) → { words, errors, delim }
function parsePersoText(text) {
  text = stripBOM(text || '');
  var delim = detectDelimiter(text);
  var rows = parseDelimited(text, delim);
  if (rows.length && looksLikeHeader(rows[0])) rows = rows.slice(1);
  var words = [], errors = 0;
  rows.forEach(function(r) {
    var w = normPerso({ k: r[0], h: r[1], fr: r[2], topic: r[3], section: r[4] });
    if (w) words.push(w); else errors++;
  });
  return { words: words, errors: errors, delim: delim };
}

// Import en masse (collage ou fichier). OK = remplacer tout, Annuler = fusionner.
function applyPersoImport(text) {
  var res = parsePersoText(text);
  if (res.words.length === 0) {
    alert('Aucune ligne valide.\n\n' +
          'Format attendu (séparateur , ; ou tabulation) :\n' +
          'kanji, kana, français, [thème], [chapitre]\n' +
          'Les trois premières colonnes sont obligatoires.');
    return;
  }
  var replace = confirm(
    res.words.length + ' mot(s) valide(s) détecté(s).\n\n' +
    'OK = REMPLACER tout ton vocabulaire perso\n' +
    'Annuler = AJOUTER à l\'existant'
  );
  persoWords = replace ? dedupePerso(res.words) : dedupePerso(persoWords.concat(res.words));
  savePerso(); rebuildVocab(); renderPersoScreen();
  var msg = res.words.length + ' mot(s) importé(s).';
  if (res.errors) msg += '\n' + res.errors + ' ligne(s) ignorée(s) (colonne obligatoire vide).';
  msg += '\n' + persoWords.length + ' mot(s) perso au total.';
  alert(msg);
}

// Ajout manuel d'un seul mot.
function addPersoManual() {
  var w = normPerso({
    k: gv('perso-in-k'), h: gv('perso-in-h'), fr: gv('perso-in-fr'),
    topic: gv('perso-in-topic'), section: gv('perso-in-section')
  });
  if (!w) { alert('Kanji, kana et français sont obligatoires.'); return; }
  persoWords = dedupePerso(persoWords.concat([w]));
  savePerso(); rebuildVocab();
  ['perso-in-k', 'perso-in-h', 'perso-in-fr', 'perso-in-topic', 'perso-in-section']
    .forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var kEl = document.getElementById('perso-in-k'); if (kEl) kEl.focus();
  renderPersoScreen();
}

function deletePersoWord(id) {
  persoWords = persoWords.filter(function(w) { return (w.k + '|' + w.h) !== id; });
  savePerso(); rebuildVocab(); renderPersoScreen();
}

function clearPerso() {
  if (persoWords.length === 0) return;
  if (!confirm('Effacer les ' + persoWords.length + ' mot(s) de ton vocabulaire perso ?\n(Action locale, irréversible.)')) return;
  persoWords = [];
  savePerso(); rebuildVocab(); renderPersoScreen();
}

// Export / import JSON (sauvegarde & partage entre appareils).
function exportPerso() {
  var blob = new Blob([JSON.stringify(persoWords, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kotoba-perso.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importPersoJSON(text, replace) {
  var arr = JSON.parse(stripBOM(text));
  if (!Array.isArray(arr)) throw new Error('Format JSON invalide (tableau attendu)');
  var clean = arr.map(normPerso).filter(Boolean);
  persoWords = replace ? dedupePerso(clean) : dedupePerso(persoWords.concat(clean));
  savePerso(); rebuildVocab(); renderPersoScreen();
  return clean.length;
}

// Petit utilitaire : valeur d'un champ par id.
function gv(id) { var el = document.getElementById(id); return el ? el.value : ''; }

// Rendu de l'écran perso (stats + liste éditable).
function renderPersoScreen() {
  var stats = document.getElementById('perso-stats');
  if (stats) {
    stats.textContent = persoWords.length === 0
      ? 'Aucun mot perso pour l\'instant.'
      : persoWords.length + ' mot(s) dans ton vocabulaire perso.';
  }
  var list = document.getElementById('perso-list');
  if (!list) return;
  list.innerHTML = '';
  if (persoWords.length === 0) {
    list.innerHTML = '<div class="perso-empty">Ajoute un mot ci-dessus, colle une liste, ou importe un fichier.</div>';
    return;
  }
  persoWords.slice().reverse().forEach(function(w) {
    var item = document.createElement('div');
    item.className = 'perso-item';

    var info = document.createElement('div');
    info.className = 'perso-item-info';
    var jp = document.createElement('div');
    jp.className = 'perso-item-jp';
    jp.textContent = w.k + (w.h && w.h !== w.k ? '（' + w.h + '）' : '');
    var fr = document.createElement('div');
    fr.className = 'perso-item-fr';
    var meta = (w.topic && w.topic !== 'Général' ? w.topic : '') +
               (w.section && w.section !== 'aucune' ? ' · ' + w.section : '');
    fr.textContent = w.fr + (meta ? '   —   ' + meta : '');
    info.appendChild(jp); info.appendChild(fr);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'perso-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Supprimer ce mot');
    var id = w.k + '|' + w.h;
    del.addEventListener('click', function() { deletePersoWord(id); });

    item.appendChild(info); item.appendChild(del);
    list.appendChild(item);
  });
}

// Câblage des contrôles perso (éléments statiques de #perso-screen).
function on(id, evt, fn) { var el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

(function wirePerso() {
  on('perso-add', 'click', addPersoManual);

  on('perso-paste-load', 'click', function() {
    var ta = document.getElementById('perso-paste');
    var text = ta ? ta.value : '';
    if (!text.trim()) { alert('Colle d\'abord tes cellules (depuis Excel, Google Sheets…).'); return; }
    applyPersoImport(text);
    if (ta) ta.value = '';
  });

  on('perso-file', 'click', function() {
    var f = document.getElementById('perso-file-input'); if (f) f.click();
  });
  on('perso-file-input', 'change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() { applyPersoImport(reader.result); };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  on('perso-export', 'click', exportPerso);
  on('perso-import', 'click', function() {
    var f = document.getElementById('perso-import-input'); if (f) f.click();
  });
  on('perso-import-input', 'change', function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var replace = confirm(
          'Importer la sauvegarde JSON :\n\n' +
          'OK = REMPLACER ton vocabulaire perso\n' +
          'Annuler = FUSIONNER avec l\'existant'
        );
        importPersoJSON(reader.result, replace);
        alert(persoWords.length + ' mot(s) perso au total.');
      } catch (err) {
        alert('Échec de l\'import JSON : ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

  on('perso-clear', 'click', clearPerso);
})();

// ============ NAVIGATION ============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============ UTILITAIRES ============
function unique(arr) { return [...new Set(arr)]; }

// Clé composite "Niveau<SEP>Topic". Séparateur non imprimable (unit separator)
// au lieu d'un espace → reste correct même si un thème perso contient des espaces.
var NT_SEP = '\u001f';
function ntKey(v) { return v.niveau + NT_SEP + v.topic; }
function ntNiveauOf(key) { return key.slice(0, key.indexOf(NT_SEP)); }
function ntTopicOf(key)  { return key.slice(key.indexOf(NT_SEP) + 1); }

// Tous les niveaux distincts, triés
function allNiveaux() {
  return unique(ALL_VOCAB.map(function(v) { return v.niveau; })).sort();
}

// Toutes les paires { key, niveau, topic } distinctes, triées par niveau puis topic
function allNT() {
  var map = {};
  ALL_VOCAB.forEach(function(v) {
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
  ALL_VOCAB.forEach(function(v) {
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
  return ALL_VOCAB.filter(function(v) {
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
function renderHomeStats() {
  var niveaux = unique(ALL_VOCAB.map(function(v) { return v.niveau; })).sort().join(', ');
  var el = document.getElementById('home-stats');
  if (el) el.textContent = ALL_VOCAB.length + ' mots · Niveaux : ' + niveaux;
}
renderHomeStats();

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
// « Favoris seulement » coché ?
function reviseFavsOnly() {
  var cb = document.getElementById('rev-fav-only');
  return !!(cb && cb.checked);
}

// Pool de mots à réviser : filtres (Niveau/Topic/Section) PUIS, si demandé,
// restriction aux favoris (intersection — comme l'écran Liste).
// « Seulement les n derniers » : 0 = tous. L'ordre de ALL_VOCAB est l'ordre
// d'ajout (vocab embarqué, puis mots perso dans l'ordre où ils ont été ajoutés),
// donc les n derniers du pool filtré = les n plus récents.
var LAST_N_OPTIONS = [0, 25, 50, 100];
var reviseLastN = 0;

function renderLastChips() {
  var container = document.getElementById('rev-chips-last');
  if (!container) return;
  container.innerHTML = '';
  LAST_N_OPTIONS.forEach(function(n) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (reviseLastN === n ? ' active' : '');
    chip.textContent = n === 0 ? 'Tous' : String(n);
    chip.addEventListener('click', function() {
      reviseLastN = n;
      renderLastChips();
      updateRevCount();
    });
    container.appendChild(chip);
  });
}
renderLastChips();

// Pool avant la limite « n derniers » (filtres + favoris).
function reviseFilteredPool() {
  var words = filterVocab(revSel);
  if (reviseFavsOnly()) words = words.filter(isFav);
  return words;
}

function revisePool() {
  var words = reviseFilteredPool();
  if (reviseLastN > 0 && words.length > reviseLastN) words = words.slice(-reviseLastN);
  return words;
}

function updateRevCount() {
  var all  = reviseFilteredPool();
  var pool = revisePool();
  var noun = reviseFavsOnly() ? 'favori(s)' : 'mot(s)';
  var txt  = pool.length + ' ' + noun + ' sélectionné(s)';
  if (pool.length < all.length) txt += ' — les ' + pool.length + ' derniers sur ' + all.length;
  document.getElementById('rev-count').textContent = txt;
}

// La case « Favoris seulement » met à jour le compteur en direct.
on('rev-fav-only', 'change', updateRevCount);

function startRevise() {
  reviseWords = revisePool();
  if (reviseWords.length === 0) {
    alert(reviseFavsOnly()
      ? 'Aucun favori ne correspond à ces filtres.\nMarque des mots avec l\'étoile ☆ dans la liste, ou décoche « Favoris seulement ».'
      : 'Aucun mot ne correspond aux filtres.');
    return;
  }
  reviseMode = document.querySelector('input[name="rev-mode"]:checked').value;
  currentWord = null;
  histBeginSession();
  scoreGood = scoreTotal = 0;
  updateScore();
  showScreen('revise-game-screen');
  nextWord();
}

// ============ MODE RÉVISION JEU ============
function nextWord() {
  // Tirage aléatoire, sans retomber sur le mot qui vient de passer
  // (sauf s'il n'y a qu'un seul mot dans la sélection).
  var prev = currentWord;
  var pick, tries = 0;
  do {
    pick = reviseWords[Math.floor(Math.random() * reviseWords.length)];
    tries++;
  } while (tries < 20 && reviseWords.length > 1 && prev && wordId(pick) === wordId(prev));
  currentWord = pick;
  revealed = false;
  updateRevStar();

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

// Étoile ☆/★ de la carte de révision : reflète et bascule le favori du mot affiché.
function updateRevStar() {
  var btn = document.getElementById('rev-star');
  if (!btn || !currentWord) return;
  var on = isFav(currentWord);
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
on('rev-star', 'click', function() {
  if (!currentWord) return;
  toggleFav(currentWord);
  updateRevStar();
});

function revealAnswer() {
  if (revealed) return;
  revealed = true;
  document.getElementById('answer-block').style.display = 'flex';
  document.getElementById('card-divider').style.display = 'block';
  document.getElementById('tap-hint').style.display     = 'none';
  document.getElementById('answer-zone').style.display  = 'grid';
}

function markAnswer(correct) {
  histRecordAnswer(currentWord, correct);
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

// ============ RÉGLAGES MÉMORISÉS ============
// Filtres + options des écrans Liste et Révision, conservés d'une ouverture à
// l'autre (localStorage, clé kotoba-reglages). Les valeurs devenues invalides
// (ex. thème perso supprimé) sont ignorées au chargement.
const SETTINGS_KEY = 'kotoba-reglages';

function selToJSON(sel) {
  return { niveau: [...sel.niveau], niveauTopic: [...sel.niveauTopic], section: [...sel.section] };
}

function selFromJSON(sel, data) {
  if (!data) return;
  var niveaux  = new Set(allNiveaux());
  var topics   = new Set(allNT().map(function(o) { return o.key; }));
  var sections = new Set(ALL_VOCAB.map(function(v) { return v.section; }));
  sel.niveau.clear(); sel.niveauTopic.clear(); sel.section.clear();
  (data.niveau || []).forEach(function(v) { if (niveaux.has(v)) sel.niveau.add(v); });
  (data.niveauTopic || []).forEach(function(v) {
    if (topics.has(v) && sel.niveau.has(ntNiveauOf(v))) sel.niveauTopic.add(v);
  });
  (data.section || []).forEach(function(v) { if (sections.has(v)) sel.section.add(v); });
  pruneSections(sel);
}

function setChecked(id, val) {
  var el = document.getElementById(id);
  if (el) el.checked = !!val;
}
function isChecked(id) {
  var el = document.getElementById(id);
  return !!(el && el.checked);
}

function saveSettings() {
  var modeEl = document.querySelector('input[name="rev-mode"]:checked');
  var s = {
    rev: {
      sel: selToJSON(revSel),
      favOnly: isChecked('rev-fav-only'),
      lastN: reviseLastN,
      mode: modeEl ? modeEl.value : 'k-fr'
    },
    learn: {
      sel: selToJSON(learnSel),
      favOnly: learnFavsOnly,
      hideJP: isChecked('hide-jp'),
      hideFR: isChecked('hide-fr')
    }
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}

function loadSettings() {
  var s;
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { s = null; }
  if (!s) return;
  if (s.rev) {
    selFromJSON(revSel, s.rev.sel);
    setChecked('rev-fav-only', s.rev.favOnly);
    if (LAST_N_OPTIONS.indexOf(s.rev.lastN) !== -1) reviseLastN = s.rev.lastN;
    renderLastChips();
    var radio = document.querySelector('input[name="rev-mode"][value="' + s.rev.mode + '"]');
    if (radio) radio.checked = true;
  }
  if (s.learn) {
    selFromJSON(learnSel, s.learn.sel);
    learnFavsOnly = !!s.learn.favOnly;
    setChecked('fav-only', learnFavsOnly);
    setChecked('hide-jp', s.learn.hideJP);
    setChecked('hide-fr', s.learn.hideFR);
  }
}
loadSettings();

// Sauvegarde après chaque interaction : ces écouteurs, posés sur document en
// dernier, passent après ceux des puces/cases (phase de remontée).
document.addEventListener('click', saveSettings);
document.addEventListener('change', saveSettings);

// ============ HISTORIQUE DES RÉVISIONS ============
// Une session = de « Commencer » à ✕. Stockage local uniquement.
// - kotoba-historique : sessions terminées (les plus récentes en dernier)
// - kotoba-session-en-cours : session active, sauvegardée à chaque réponse ;
//   si l'app est fermée sans ✕, elle est versée dans l'historique au
//   prochain lancement (ou au prochain « Commencer »).
// Session : { start, end, mode, favOnly, lastN, sel, total, good,
//             themes: { clé: { n, g } } }   (end = heure de la dernière réponse)
const HIST_KEY = 'kotoba-historique';
const HIST_CUR_KEY = 'kotoba-session-en-cours';
const HIST_MAX = 1000;          // sessions conservées
const HIST_STALE_DAYS = 14;     // au-delà : date en orange (« à revoir »)
const HIST_PAGE = 50;           // sessions affichées avant « Afficher plus »

let histSession = null;
let histTab = 'sessions';
let histSort = 'oldest';
let histShown = HIST_PAGE;
let histOpen = new Set();       // sessions dépliées (par heure de début)

function loadHistory() {
  try {
    var arr = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveHistory(arr) {
  if (arr.length > HIST_MAX) arr = arr.slice(arr.length - HIST_MAX);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(arr)); } catch (e) {}
}

// Les mots perso forment un seul thème « Perso » ; les autres : Niveau + Topic.
function histThemeKey(w) { return w.niveau === 'Perso' ? 'Perso' : ntKey(w); }
function histThemeLabel(key) {
  return key === 'Perso' ? 'Perso' : ntNiveauOf(key) + ' · ' + ntTopicOf(key);
}
function histCompareKeys(a, b) {
  if (a === 'Perso') return 1;
  if (b === 'Perso') return -1;
  var na = ntNiveauOf(a), nb = ntNiveauOf(b);
  if (na !== nb) return na.localeCompare(nb);
  return ntTopicOf(a).localeCompare(ntTopicOf(b), undefined, { numeric: true });
}

// Verse la session en cours (si elle contient au moins une carte) dans l'historique.
function histFlushPending() {
  var cur = null;
  try { cur = JSON.parse(localStorage.getItem(HIST_CUR_KEY) || 'null'); } catch (e) {}
  try { localStorage.removeItem(HIST_CUR_KEY); } catch (e) {}
  if (cur && cur.total > 0) {
    var arr = loadHistory();
    if (!arr.some(function(s) { return s.start === cur.start; })) {
      arr.push(cur);
      saveHistory(arr);
    }
  }
}

function histBeginSession() {
  histFlushPending();
  histSession = {
    start: Date.now(), end: Date.now(),
    mode: reviseMode, favOnly: reviseFavsOnly(), lastN: reviseLastN,
    sel: selToJSON(revSel),
    total: 0, good: 0, themes: {}
  };
}

function histRecordAnswer(w, correct) {
  if (!histSession || !w) return;
  var k = histThemeKey(w);
  var t = histSession.themes[k] || (histSession.themes[k] = { n: 0, g: 0 });
  t.n++; histSession.total++;
  if (correct) { t.g++; histSession.good++; }
  histSession.end = Date.now();
  try { localStorage.setItem(HIST_CUR_KEY, JSON.stringify(histSession)); } catch (e) {}
}

function histEndSession() {
  histSession = null;
  histFlushPending();
}

// Au lancement : récupère une session interrompue (app fermée sans ✕).
histFlushPending();

// --- Utilitaires d'affichage ---
function esc(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pctOf(g, n) { return n ? Math.round(g / n * 100) : 0; }
function pctClass(p) { return p >= 80 ? 'good' : (p >= 60 ? 'mid' : 'low'); }
function dayStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function daysAgo(t) { return Math.round((dayStart(Date.now()) - dayStart(t)) / 86400000); }
function fmtDayLabel(t) {
  var d = new Date(t);
  var opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  var txt = d.toLocaleDateString('fr-FR', opts);
  var n = daysAgo(t);
  return n === 0 ? 'Aujourd\'hui · ' + txt : (n === 1 ? 'Hier · ' + txt : txt);
}
function fmtTime(t) {
  return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtAgo(t) {
  var n = daysAgo(t);
  return n === 0 ? 'aujourd\'hui' : (n === 1 ? 'hier' : 'il y a ' + n + ' j');
}
function fmtDuration(s) {
  var min = Math.round((s.end - s.start) / 60000);
  return min < 1 ? '< 1 min' : min + ' min';
}
var MODE_LABELS = { 'k-fr': '漢 → tout', 'jp-fr': '漢+ひ → FR', 'fr-jp': 'FR → 漢+ひ' };

function tagHTML(key, extra) {
  return '<span class="hist-tag' + (key === 'Perso' ? ' perso' : '') + (extra || '') + '">' +
         esc(histThemeLabel(key)) + '</span>';
}
function barHTML(p) {
  return '<div class="bar"><span class="' + pctClass(p) + '" style="width:' + p + '%"></span></div>';
}

// Description lisible des réglages d'une session
function histSettingsText(s) {
  var sel = s.sel || {};
  var parts = [];
  var niv = sel.niveau || [], top = sel.niveauTopic || [], sec = sel.section || [];
  var where = niv.length ? niv.join(', ') : 'tous niveaux';
  if (top.length) where += ' › ' + top.map(ntTopicOf).join(', ');
  if (sec.length) where += ' › ' + sec.join(', ');
  parts.push(where);
  parts.push(s.lastN ? s.lastN + ' derniers mots' : 'tous les mots');
  if (s.favOnly) parts.push('favoris seulement');
  parts.push(MODE_LABELS[s.mode] || s.mode);
  return 'Réglages : ' + parts.join(' · ');
}

// --- Rendu ---
function renderHistory() {
  var arr = loadHistory();
  document.querySelectorAll('#hist-seg button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === histTab);
  });
  var summary = document.getElementById('hist-summary');
  var sessEl = document.getElementById('hist-sessions');
  var themEl = document.getElementById('hist-themes');
  summary.style.display = histTab === 'sessions' ? '' : 'none';
  sessEl.style.display  = histTab === 'sessions' ? '' : 'none';
  themEl.style.display  = histTab === 'themes' ? '' : 'none';
  if (histTab === 'sessions') {
    renderHistSummary(arr);
    renderHistSessions(arr);
  } else {
    renderHistThemes(arr);
  }
}

function renderHistSummary(arr) {
  var today = dayStart(Date.now());
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today); d.setDate(d.getDate() - i);
    days.push({ t: d.getTime(), cards: 0 });
  }
  var nSess = 0, n = 0, g = 0;
  arr.forEach(function(s) {
    var ds = dayStart(s.start);
    for (var j = 0; j < days.length; j++) {
      if (days[j].t === ds) { days[j].cards += s.total; nSess++; n += s.total; g += s.good; break; }
    }
  });
  var max = Math.max.apply(null, days.map(function(d) { return d.cards; })) || 1;
  var p = pctOf(g, n);
  var pctColor = n ? { good: '#5fd38d', mid: 'var(--gold)', low: '#ff7b6b' }[pctClass(p)] : 'var(--smoke)';
  var letters = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  var html =
    '<div class="hist-summary-title">7 derniers jours</div>' +
    '<div class="hist-stats">' +
      '<div class="hist-stat"><div class="hist-stat-val">' + nSess + '</div><div class="hist-stat-lbl">sessions</div></div>' +
      '<div class="hist-stat"><div class="hist-stat-val">' + n + '</div><div class="hist-stat-lbl">cartes</div></div>' +
      '<div class="hist-stat"><div class="hist-stat-val" style="color:' + pctColor + '">' + (n ? p + ' %' : '—') + '</div><div class="hist-stat-lbl">réussite</div></div>' +
    '</div><div class="hist-week">';
  days.forEach(function(d, idx) {
    var isToday = idx === days.length - 1;
    var h = d.cards ? Math.max(4, Math.round(d.cards / max * 26)) : 0;
    html += '<div class="hist-week-day" title="' + d.cards + ' carte(s)">' +
      '<div class="hist-week-bar' + (d.cards ? '' : ' zero') + '" style="height:' + h + 'px' + (isToday && d.cards ? ';background:var(--gold)' : '') + '"></div>' +
      '<div class="hist-week-lbl"' + (isToday ? ' style="color:var(--gold)"' : '') + '>' + letters[new Date(d.t).getDay()] + '</div></div>';
  });
  html += '</div>';
  document.getElementById('hist-summary').innerHTML = html;
}

function renderHistSessions(arr) {
  var el = document.getElementById('hist-sessions');
  if (arr.length === 0) {
    el.innerHTML = '<div class="hist-empty">Aucune révision enregistrée pour l\'instant.<br>Tes prochaines sessions apparaîtront ici.</div>';
    return;
  }
  var list = arr.slice().reverse();
  var shown = list.slice(0, histShown);
  var html = '', lastDay = null;
  shown.forEach(function(s) {
    var day = dayStart(s.start);
    if (day !== lastDay) { html += '<div class="hist-day">' + esc(fmtDayLabel(s.start)) + '</div>'; lastDay = day; }
    var keys = Object.keys(s.themes || {}).sort(histCompareKeys);
    var tags = keys.slice(0, 3).map(function(k) { return tagHTML(k); }).join('');
    if (keys.length > 3) tags += '<span class="hist-tag more">+' + (keys.length - 3) + '</span>';
    var sub = [MODE_LABELS[s.mode] || s.mode];
    if (s.lastN) sub.push(s.lastN + ' derniers');
    if (s.favOnly) sub.push('★');
    sub.push(fmtDuration(s));
    var p = pctOf(s.good, s.total);
    var open = histOpen.has(s.start);
    html += '<div class="hist-sess"><div class="hist-sess-head" data-start="' + s.start + '">' +
      '<div class="hist-time">' + fmtTime(s.start) + '</div>' +
      '<div class="hist-main"><div class="hist-tags">' + tags + '</div><div class="hist-sub">' + esc(sub.join(' · ')) + '</div></div>' +
      '<div class="hist-right"><span class="pct ' + pctClass(p) + '">' + p + ' %</span><span class="hist-cards">' + s.total + ' carte' + (s.total > 1 ? 's' : '') + '</span></div>' +
      '</div>';
    if (open) {
      html += '<div class="hist-detail">';
      keys.forEach(function(k) {
        var t = s.themes[k], tp = pctOf(t.g, t.n);
        html += '<div class="hist-row"><span class="hist-row-name">' + esc(histThemeLabel(k)) + '</span>' + barHTML(tp) +
                '<span class="hist-row-val">' + t.g + '/' + t.n + ' · ' + tp + ' %</span></div>';
      });
      html += '<div class="hist-settings">' + esc(histSettingsText(s)) + '</div></div>';
    }
    html += '</div>';
  });
  if (list.length > shown.length) {
    html += '<button type="button" class="fav-btn hist-more" id="hist-more">Afficher plus (' + (list.length - shown.length) + ')</button>';
  }
  el.innerHTML = html;
  el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.gap = '10px';
}

function renderHistThemes(arr) {
  var el = document.getElementById('hist-themes');
  var agg = {};
  arr.forEach(function(s) {
    Object.keys(s.themes || {}).forEach(function(k) {
      var a = agg[k] || (agg[k] = { key: k, n: 0, g: 0, sessions: 0, last: 0 });
      a.n += s.themes[k].n; a.g += s.themes[k].g; a.sessions++;
      if (s.end > a.last) a.last = s.end;
    });
  });
  var done = Object.keys(agg).map(function(k) { return agg[k]; });
  done.sort(function(a, b) {
    if (histSort === 'score') return pctOf(a.g, a.n) - pctOf(b.g, b.n);   // les plus faibles d'abord
    if (histSort === 'cards') return b.n - a.n;
    return a.last - b.last;                                                // le plus ancien d'abord
  });
  // Thèmes jamais révisés (en bas) — seulement pour les niveaux déjà travaillés
  // (+ Perso), pour ne pas noyer la liste sous toutes les leçons des autres niveaux.
  var workedNiv = {};
  done.forEach(function(a) { if (a.key !== 'Perso') workedNiv[ntNiveauOf(a.key)] = true; });
  var never = allNT().map(function(o) { return o.niveau === 'Perso' ? 'Perso' : o.key; })
    .filter(function(k, i, a) {
      return a.indexOf(k) === i && !agg[k] && (k === 'Perso' || workedNiv[ntNiveauOf(k)]);
    })
    .sort(histCompareKeys);

  var sorts = [['oldest', 'Le plus ancien'], ['score', 'Score'], ['cards', 'Cartes']];
  var html = '<div class="sort-row"><span class="sort-lbl">Trier</span>' +
    sorts.map(function(o) {
      return '<button type="button" class="chip' + (histSort === o[0] ? ' active' : '') + '" data-sort="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';

  if (done.length === 0 && never.length === 0) {
    html += '<div class="hist-empty">Aucun thème pour l\'instant.</div>';
  } else {
    html += '<div class="theme-list">';
    done.forEach(function(a) {
      var p = pctOf(a.g, a.n);
      var old = daysAgo(a.last) > HIST_STALE_DAYS;
      html += '<div class="theme-item">' +
        '<div class="theme-name">' + tagHTML(a.key) + '</div>' +
        '<div class="theme-when ' + (old ? 'when-old' : 'when-ok') + '">' + fmtAgo(a.last) + '</div>' +
        '<div class="theme-meta"><span>' + a.n + ' carte' + (a.n > 1 ? 's' : '') + ' · ' + a.sessions + ' session' + (a.sessions > 1 ? 's' : '') + '</span>' +
        '<div class="theme-score">' + barHTML(p) + '<b>' + p + ' %</b></div></div></div>';
    });
    never.forEach(function(k) {
      html += '<div class="theme-item"><div class="theme-name">' + tagHTML(k, ' dim') + '</div>' +
              '<div class="theme-when when-never">jamais révisé</div></div>';
    });
    html += '</div>';
  }
  html += '<div class="hist-foot"><button type="button" class="fav-btn" id="hist-export">↓ Exporter</button>' +
          '<button type="button" class="fav-btn" id="hist-clear">Effacer l\'historique</button></div>';
  el.innerHTML = html;
  el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.gap = '14px';
}

function exportHistory() {
  var blob = new Blob([JSON.stringify(loadHistory(), null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kotoba-historique.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

// Interactions de l'écran Historique (délégation sur le conteneur)
on('hist-body', 'click', function(e) {
  var t;
  if ((t = e.target.closest('#hist-seg button'))) {
    histTab = t.dataset.tab; renderHistory(); return;
  }
  if ((t = e.target.closest('[data-sort]'))) {
    histSort = t.dataset.sort; renderHistory(); return;
  }
  if ((t = e.target.closest('.hist-sess-head'))) {
    var k = Number(t.dataset.start);
    if (histOpen.has(k)) histOpen.delete(k); else histOpen.add(k);
    renderHistory(); return;
  }
  if (e.target.closest('#hist-more')) { histShown += HIST_PAGE; renderHistory(); return; }
  if (e.target.closest('#hist-export')) { exportHistory(); return; }
  if (e.target.closest('#hist-clear')) {
    var n = loadHistory().length;
    if (n === 0) return;
    if (!confirm('Effacer les ' + n + ' session(s) de l\'historique ?\n(Action locale, irréversible.)')) return;
    saveHistory([]); histOpen.clear(); renderHistory();
  }
});

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
    case 'goto-help':  showScreen('help-screen'); break;
    case 'goto-perso':
      renderPersoScreen();
      showScreen('perso-screen');
      break;
    case 'goto-perso-help': showScreen('perso-help-screen'); break;
    case 'start-revise':  startRevise(); break;
    case 'stop-revise':   histEndSession(); showScreen('home-screen'); break;
    case 'goto-hist':     renderHistory(); showScreen('hist-screen'); break;
    case 'mark-right':    markAnswer(true);  break;
    case 'mark-wrong':    markAnswer(false); break;
  }
});

document.getElementById('card').addEventListener('click', revealAnswer);
document.getElementById('card').addEventListener('keydown', function(e) {
  if (e.key === ' ' || e.key === 'Enter') revealAnswer();
});
