"""
convert_grammaire.py
--------------------
Convertit un fichier Markdown de grammaire (concaténation des fiches par thème)
en grammaire.js, utilisable directement par l'app Kotoba.

Format attendu du fichier Markdown d'entrée :

  # Grammaire — B1-1 · Thème 3 · 私の好きな音楽   ← en-tête de thème
  ---
  ## 1. いつも無理に歌わされるから。              ← point principal
  *On me force toujours à chanter…*
  ... corps du point ...
  ### • ホイトートという料理も教えてほしいな。    ← sous-point (rattaché au point précédent)
  *J'aimerais bien que tu m'apprennes...*
  ... corps du sous-point ...
  ---                                              ← séparateur (ignoré)
  ## 2. ...                                        ← point suivant

Plusieurs thèmes peuvent se suivre dans le même fichier, séparés chacun
par leur propre en-tête `# Grammaire — ...`.

Usage :
    python convert_grammaire.py                          # entrée: grammaire_all.md  sortie: grammaire.js
    python convert_grammaire.py --in mon_fichier.md --out grammaire.js
"""

import re
import json
import argparse
import os
import sys

DEFAULT_IN  = os.path.join(os.path.dirname(__file__), "grammaire_all.md")
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "grammaire.js")


# ---------------------------------------------------------------------------
# Parsing de l'en-tête de thème
# Ex: "# Grammaire — B1-1 · Thème 3 · 私の好きな音楽"
# ---------------------------------------------------------------------------
THEME_HEADER_RE = re.compile(
    r"^#\s+Grammaire\s*[—–-]+\s*"  # "# Grammaire —"
    r"(?P<niveau>[^\·]+?)"          # "B1-1"
    r"\s*[·•]\s*"
    r"Th[eè]me\s*(?P<num>\d+)"     # "Thème 3"
    r"(?:\s*[·•]\s*(?P<titre>.+))?$",  # "· 私の好きな音楽" (optionnel)
    re.IGNORECASE
)

# En-tête de point principal : ## 1. phrase japonaise
POINT_RE = re.compile(r"^##\s+(?P<num>\d+)\.\s+(?P<jp>.+)$")

# Ligne de traduction (italique) : *traduction française*
TRADUCTION_RE = re.compile(r"^\*(?P<fr>.+)\*\s*$")

# Sous-point : ### • phrase japonaise  ou  ### • phrase
SUBPOINT_RE = re.compile(r"^###\s+[•·]\s+(?P<jp>.+)$")

# Séparateur horizontal (ignoré structurellement)
SEP_RE = re.compile(r"^---+\s*$")


# ---------------------------------------------------------------------------
# Conversion Markdown → HTML minimal pour l'affichage dans l'app
# (évite une dépendance lourde ; couvre les patterns réellement présents)
# ---------------------------------------------------------------------------

def md_body_to_html(lines: list[str]) -> str:
    """
    Convertit un bloc de lignes Markdown (corps d'un point) en HTML.
    Gère : paragraphes, blocs > (citations), **gras**, *italique*,
           listes non ordonnées, N.B., ⚠️, titres ### (sous-titres internes).
    """
    html_parts = []
    i = 0

    def inline(text: str) -> str:
        """Applique les transformations inline : gras, italique, code."""
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"\*(.+?)\*",     r"<em>\1</em>",         text)
        text = re.sub(r"`(.+?)`",       r"<code>\1</code>",      text)
        return text

    while i < len(lines):
        line = lines[i]

        # Ligne vide → séparateur de paragraphe (géré implicitement)
        if line.strip() == "":
            i += 1
            continue

        # Séparateur --- (dans le corps, ignoré)
        if SEP_RE.match(line):
            i += 1
            continue

        # Bloc de citation > (exemples japonais + traduction)
        if line.startswith(">"):
            block_lines = []
            while i < len(lines) and lines[i].startswith(">"):
                block_lines.append(lines[i][1:].strip())
                i += 1
            # Alternance jp / fr : lignes paires = jp, impaires = fr
            pairs = []
            j = 0
            while j < len(block_lines):
                jp_line = block_lines[j]
                fr_line = block_lines[j+1] if j+1 < len(block_lines) else ""
                # Heuristique : si la ligne contient du japonais (caractères CJK)
                has_cjk = bool(re.search(r"[\u3040-\u9fff\uff00-\uffef]", jp_line))
                if has_cjk:
                    pairs.append((jp_line, fr_line))
                    j += 2
                else:
                    # Ligne purement romane (formule, indication) → afficher seule
                    pairs.append((None, jp_line))
                    j += 1
            items_html = ""
            for jp, fr in pairs:
                if jp is None:
                    items_html += f'<div class="ex-note">{inline(fr)}</div>'
                else:
                    items_html += (
                        f'<div class="example">'
                        f'<div class="ex-jp">{inline(jp)}</div>'
                        f'<div class="ex-fr">{inline(fr)}</div>'
                        f"</div>"
                    )
            html_parts.append(f'<div class="examples-block">{items_html}</div>')
            continue

        # Sous-titre interne (### dans le corps, ex: "### • ..." déjà parsé au niveau supérieur
        # mais aussi "**① ...**" traité comme paragraphe gras)
        # Titre H3 résiduel
        if line.startswith("### "):
            text = line[4:].strip().lstrip("•·").strip()
            html_parts.append(f'<h4 class="body-h4">{inline(text)}</h4>')
            i += 1
            continue

        # Paragraphe normal (potentiellement multi-lignes jusqu'à ligne vide)
        para_lines = []
        while i < len(lines) and lines[i].strip() != "" and not lines[i].startswith(">") and not SEP_RE.match(lines[i]) and not lines[i].startswith("### "):
            para_lines.append(lines[i].strip())
            i += 1
        if para_lines:
            text = " ".join(para_lines)
            html_parts.append(f"<p>{inline(text)}</p>")
        continue

    return "\n".join(html_parts)


# ---------------------------------------------------------------------------
# Parser principal
# ---------------------------------------------------------------------------

def parse_markdown(content: str) -> list[dict]:
    """
    Retourne une liste de thèmes :
    [
      {
        "niveau": "B1-1",
        "theme_num": "3",
        "titre_jp": "私の好きな音楽",
        "id": "B1-1_T3",
        "points": [
          {
            "num": "1",
            "jp": "いつも無理に歌わされるから。",
            "fr": "On me force toujours à chanter…",
            "html": "<p>...</p>..."
          },
          ...
        ]
      },
      ...
    ]
    """
    lines = content.splitlines()

    themes = []
    current_theme = None
    current_point = None   # {"num", "jp", "fr", "body_lines": []}
    body_lines = []

    def flush_point():
        """Finalise le point courant et l'ajoute au thème."""
        nonlocal current_point, body_lines
        if current_point is None:
            return
        current_point["html"] = md_body_to_html(body_lines)
        current_theme["points"].append(current_point)
        current_point = None
        body_lines = []

    def flush_theme():
        nonlocal current_theme
        if current_theme is None:
            return
        flush_point()
        themes.append(current_theme)
        current_theme = None

    i = 0
    while i < len(lines):
        line = lines[i]

        # ── En-tête de thème ──────────────────────────────────────────────
        m = THEME_HEADER_RE.match(line.strip())
        if m:
            flush_theme()
            niveau    = m.group("niveau").strip()
            theme_num = m.group("num").strip()
            titre_jp  = (m.group("titre") or "").strip()
            slug_niveau = re.sub(r"[^a-zA-Z0-9]", "", niveau)  # "B11"
            current_theme = {
                "niveau":    niveau,
                "theme_num": theme_num,
                "titre_jp":  titre_jp,
                "id":        f"{slug_niveau}_T{theme_num}",
                "points":    [],
            }
            i += 1
            continue

        if current_theme is None:
            i += 1
            continue

        # ── Séparateur horizontal ─────────────────────────────────────────
        if SEP_RE.match(line):
            i += 1
            continue

        # ── Point principal ## N. jp ──────────────────────────────────────
        m = POINT_RE.match(line.strip())
        if m:
            flush_point()
            current_point = {
                "num": m.group("num"),
                "jp":  m.group("jp").strip(),
                "fr":  "",
            }
            body_lines = []
            # Ligne suivante : traduction en italique ?
            if i+1 < len(lines):
                mt = TRADUCTION_RE.match(lines[i+1].strip())
                if mt:
                    current_point["fr"] = mt.group("fr").strip()
                    i += 2
                    continue
            i += 1
            continue

        # ── Sous-point ### • jp ───────────────────────────────────────────
        m = SUBPOINT_RE.match(line.strip())
        if m and current_point is not None:
            # Ajouter un marqueur dans le body du point courant
            sub_jp = m.group("jp").strip()
            sub_fr = ""
            if i+1 < len(lines):
                mt = TRADUCTION_RE.match(lines[i+1].strip())
                if mt:
                    sub_fr = mt.group("fr").strip()
                    i += 1
            body_lines.append(
                f'<h4 class="subpoint-title">'
                f'<span class="subpoint-jp">{sub_jp}</span>'
                + (f'<span class="subpoint-fr"> — {sub_fr}</span>' if sub_fr else "")
                + "</h4>"
            )
            i += 1
            continue

        # ── Ligne du corps ────────────────────────────────────────────────
        if current_point is not None:
            body_lines.append(line)

        i += 1

    flush_theme()
    return themes


# ---------------------------------------------------------------------------
# Génération du JS
# ---------------------------------------------------------------------------

def generate_js(themes: list[dict]) -> str:
    lines = [
        "// Généré automatiquement par convert_grammaire.py — ne pas modifier manuellement",
        "const GRAMMAIRE = " + json.dumps(themes, ensure_ascii=False, indent=2) + ";",
    ]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Convertit grammaire_all.md → grammaire.js")
    parser.add_argument("--in",  dest="input",  default=DEFAULT_IN,  help="Fichier Markdown d'entrée")
    parser.add_argument("--out", dest="output", default=DEFAULT_OUT, help="Fichier JS de sortie")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"ERREUR : fichier introuvable : {args.input}")
        sys.exit(1)

    with open(args.input, encoding="utf-8") as f:
        content = f.read()

    themes = parse_markdown(content)

    if not themes:
        print("ERREUR : aucun thème trouvé. Vérifiez le format du fichier Markdown.")
        sys.exit(1)

    js = generate_js(themes)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(js)

    # Stats
    total_points = sum(len(t["points"]) for t in themes)
    print(f"✓ {len(themes)} thème(s), {total_points} point(s) de grammaire → {args.output}")
    for t in themes:
        print(f"  [{t['id']}] {t['niveau']} · T{t['theme_num']} · {t['titre_jp']} — {len(t['points'])} points")
    print()
    print("Prochaine étape :")
    print("  git add grammaire.js")
    print('  git commit -m "Mise à jour grammaire"')
    print("  git push")


if __name__ == "__main__":
    main()
