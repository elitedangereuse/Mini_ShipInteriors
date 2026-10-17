#!/usr/bin/env python3
"""Importe des pochettes d'album pour le jukebox, à leur taille d'affichage (Pillow requis).
Usage: python scripts/import-jukebox-covers.py chemin/vers/pochette.png [...]
Chaque image devient public/assets/music/covers/<nom>.webp, carrée, en 256 × 256 : le jukebox ne
l'affiche pas à plus de 112 px CSS (src/music.css), 224 pixels sur un écran haute densité. Les
originaux fournis par l'équipe (1024 à 1254 px, 2 Mo environ en PNG) restent hors du jeu, que la
liste du jukebox chargeait tous à son ouverture.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/music/covers'
SIZE = 256
QUALITY = 85


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('images', nargs='+', type=Path)
    args = parser.parse_args()
    for src in args.images:
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        # Recadrée au centre si elle n'est pas carrée, comme l'affiche le jukebox (object-fit: cover).
        im = ImageOps.fit(im, (SIZE, SIZE), Image.Resampling.LANCZOS)
        dest = OUT / f'{src.stem}.webp'
        im.save(dest, 'WEBP', quality=QUALITY, method=6)
        print(f'{dest.relative_to(ROOT)} : {src.stat().st_size} -> {dest.stat().st_size} octets')


if __name__ == '__main__':
    main()
