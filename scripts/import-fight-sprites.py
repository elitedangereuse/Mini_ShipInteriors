#!/usr/bin/env python3
"""Importe Fantasy Martial Characters 2 de LuizMelo, décompressé (Pillow requis). Ne conserve que les sprites.
Usage: python scripts/import-fight-sprites.py .sprite-imports
Les pixels restent ceux des sources ; découpage transparent, atlas et pivots communs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from PIL import Image

PACKS = {f'character-{i}': (f'Character {i}', {'idle': 4, 'run': 8, 'jump': 2, 'fall': 2, 'light': 4, 'heavy': 4, 'hit': 4, 'death': 4}) for i in range(1, 7)}
SOURCE = 'https://luizmelo.itch.io/fantasy-martial-characters-2'
ALIASES = {'idle': ['idle'], 'run': ['run'], 'jump': ['jump', 'goingup'], 'fall': ['fall', 'goingdown'],
           'light': ['attack1', 'attack01', 'attack'], 'heavy': ['attack2', 'attack02'],
           'special': ['attack3', 'attack03'], 'hit': ['takehit', 'hit', 'hurt'], 'death': ['death', 'die'],
           'guard': ['block', 'guard'], 'crouch': ['crouch']}
normal = lambda value: re.sub(r'[^a-z0-9]', '', value.lower())

def import_pack(archive, slug, title, counts, dest):
    clips = {}
    names = list(archive.rglob('*.png'))
    for action, aliases in ALIASES.items():
        if slug in ['character-2', 'character-4']:
            if action == 'light': aliases = ['attack2']
            if action == 'heavy': aliases = ['attack1']
        matches = [n for n in names if any(normal(n.stem) == a for a in aliases)]
        if not matches:
            if action in counts: raise ValueError(f'{title}: animation {action} absente')
            continue
        im = Image.open(matches[0]).convert('RGBA')
        count = counts.get(action, max(1, im.width // 100))
        if im.size != (100 * count, 100): raise ValueError(f'{title}/{action}: dimensions inattendues {im.size}')
        clips[action] = [im.crop((i * 100, 0, (i + 1) * 100, 100)) for i in range(count)]
    idle = clips['idle']
    bounds = [f.getbbox() for f in idle]
    if any(b is None for b in bounds): raise ValueError(f'{title}: frames idle vides')
    floor = max(b[3] for b in bounds)
    anchor = idle[0].width / 2
    scale = 2
    # Paquetage de lignes avec une bordure transparente d'un pixel par image.
    entries = []
    animations = {}
    x = y = row = 0
    for action, frames in clips.items():
        animations[action] = []
        for f in frames:
            box = f.getbbox() or (0, 0, 1, 1)
            crop = f.crop(box)
            if x + crop.width + 2 > 1024: x = 0; y += row; row = 0
            meta = {'x': x + 1, 'y': y + 1, 'w': crop.width, 'h': crop.height,
                    'ox': box[0] - anchor, 'oy': box[1] - floor}
            animations[action].append(meta)
            entries.append((crop, x + 1, y + 1))
            x += crop.width + 2; row = max(row, crop.height + 2)
    height = y + row
    atlas = Image.new('RGBA', (1024, height))
    for crop, xx, yy in entries: atlas.paste(crop, (xx, yy))
    # Rogner la largeur de l'atlas si les animations tiennent sur une seule ligne.
    if y == 0: atlas = atlas.crop((0, 0, x, height))
    dest.mkdir(parents=True, exist_ok=True)
    atlas.save(dest / (slug + '.png'), optimize=True)
    contacts = {'character-1': [2, 2], 'character-2': [2, 0], 'character-3': [2, 2], 'character-4': [2, 1], 'character-5': [1, 3], 'character-6': [2, 2]}[slug]
    return {'contacts': {'light': contacts[0], 'heavy': contacts[1]}, 'title': title, 'source': SOURCE, 'license': 'CC0-1.0',
            'sourceSha256': hashlib.sha256(b''.join(p.read_bytes() for p in sorted(names))).hexdigest(), 'scale': scale,
            'animations': animations}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archives', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    dest = root / 'src/arcade/assets/fighters'
    data = {}
    for slug, (title, counts) in PACKS.items():
        folder = args.archives / title
        if not folder.is_dir(): raise ValueError(f'Dossier {title} absent')
        data[slug] = import_pack(folder, slug, title, counts, dest)
        print(slug, {k: len(v) for k, v in data[slug]['animations'].items()}, 'scale', data[slug]['scale'])
    # Module TS plutôt que JSON : importable aussi par les outils de rendu hors navigateur.
    (dest / 'manifest.ts').write_text('// Généré par scripts/import-fight-sprites.py ; sprites originaux de LuizMelo, CC0.\nexport default ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    credits = ['Sprites de Ruelle Fighter II — LuizMelo', 'Licence : CC0 1.0 Universal',
               'https://creativecommons.org/publicdomain/zero/1.0/', '',
               'Adaptation technique : bandes découpées en frames, marges transparentes retirées,',
               'atlas PNG et pivots communs. Aucun pixel du dessin original n’a été repeint.', '']
    credits.extend(['Fantasy Martial Characters 2', SOURCE, 'Character 1 à Character 6 : les six combattants du pack.'])
    (dest / 'ORIGINAL_LICENSE.txt').write_bytes((args.archives / 'License.txt').read_bytes())
    (dest / 'CREDITS.txt').write_text('\n'.join(credits) + '\n')

if __name__ == '__main__': main()
