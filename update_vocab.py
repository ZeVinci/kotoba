"""
update_vocab.py
---------------
Lit le CSV de vocabulaire Marugoto et génère vocab2.js
dans le dossier du projet Kotoba (à adapter selon votre chemin).

Usage :
    python update_vocab.py

Optionnel — spécifier un chemin de sortie différent :
    python update_vocab.py --out C:/chemin/vers/mon-repo/vocab2.js
"""

import csv
import json
import argparse
import os
import sys

# ============================================================
# CONFIGURATION — adaptez ces chemins si nécessaire
# ============================================================

# Chemin vers le CSV source (même dossier que ce script par défaut)
DEFAULT_CSV = os.path.join(os.path.dirname(__file__), "vocabulaire_marugoto_v2.csv")

# Chemin de sortie par défaut : vocab2.js dans le même dossier que ce script
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "vocab2.js")

# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Génère vocab2.js depuis le CSV Marugoto")
    parser.add_argument("--csv", default=DEFAULT_CSV, help="Chemin vers le CSV source")
    parser.add_argument("--out", default=DEFAULT_OUT, help="Chemin de sortie pour vocab2.js")
    args = parser.parse_args()

    # Lecture du CSV
    if not os.path.exists(args.csv):
        print(f"ERREUR : fichier CSV introuvable : {args.csv}")
        sys.exit(1)

    rows = []
    with open(args.csv, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "k":       row["Japonais kanji"].strip(),
                "h":       row["Japonais simple"].strip(),
                "fr":      row["Français"].strip(),
                "topic":   row["Topic"].strip(),
                "section": row["Section"].strip(),
                "niveau":  row["Niveau"].strip(),
            })

    if not rows:
        print("ERREUR : le CSV est vide ou mal formaté.")
        sys.exit(1)

    # Génération du JS
    js_content = (
        "// Généré automatiquement par update_vocab.py — ne pas modifier manuellement\n"
        "const VOCAB = " + json.dumps(rows, ensure_ascii=False, indent=2) + ";\n"
    )

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(js_content)

    # Stats
    from collections import Counter
    topics = Counter(r["topic"] for r in rows)
    print(f"✓ {len(rows)} entrées écrites dans : {args.out}")
    print("  Par topic :", dict(sorted(topics.items())))
    print()
    print("Prochaine étape :")
    print("  git add vocab2.js")
    print('  git commit -m "Mise à jour vocabulaire"')
    print("  git push")

if __name__ == "__main__":
    main()
