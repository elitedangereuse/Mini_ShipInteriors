#!/usr/bin/env python3
"""Pochette de l'album « Scavengers » du jukebox : Kael devant le visage d'ARIA, en pixels,
d'après les portraits du jeu (32 × 32), sur un écran cathodique vert phosphore."""

from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public/assets/music/covers/scavengers.svg"

SKIN, SHADE, HAIR, HAIR_LIGHT, EYE, MOUTH, SCAR = "#d4a574", "#b8895c", "#3d2b1f", "#5a4030", "#4a7c59", "#8b5e3c", "#c49070"
SUIT, SUIT_LIGHT, SUIT_DARK = "#4a5568", "#636f80", "#2d3748"

# Kael (cf. PixelPortraits.ts de Scavengers) : x, y, largeur, hauteur, couleur.
KAEL = [
    (13, 24, 6, 4, SKIN), (6, 26, 20, 6, SUIT), (8, 27, 16, 5, SUIT_LIGHT), (14, 26, 4, 2, SUIT_DARK),
    (11, 8, 10, 16, SKIN), (10, 10, 12, 12, SKIN), (12, 7, 8, 2, SKIN), (10, 18, 12, 4, SHADE),
    (10, 6, 12, 5, HAIR), (9, 7, 2, 6, HAIR), (22, 8, 1, 5, HAIR), (11, 5, 10, 2, HAIR_LIGHT),
    (10, 5, 1, 1, HAIR), (21, 6, 1, 1, HAIR), (9, 9, 1, 1, HAIR_LIGHT),
    (12, 13, 3, 2, "#ffffff"), (18, 13, 3, 2, "#ffffff"), (13, 13, 1, 1, EYE), (19, 13, 1, 1, EYE),
    (15, 15, 2, 1, SHADE), (15, 16, 1, 1, SHADE), (13, 19, 5, 1, MOUTH),
    (20, 15, 1, 2, SCAR), (21, 16, 1, 1, SCAR),
    (12, 20, 1, 1, SHADE), (14, 21, 1, 1, SHADE), (17, 21, 1, 1, SHADE), (19, 20, 1, 1, SHADE), (11, 18, 1, 1, SHADE),
]

FACE, FACE_DARK, GLOW, CIRCUIT, DIM = "#00e5ff", "#0091a1", "#80f0ff", "#00bcd4", "#006070"

# ARIA, sans son fond : le visage, ses circuits, ses yeux, sa bouche.
ARIA = [(10, 6, 12, 18, FACE_DARK), (8, 8, 16, 14, FACE), (9, 7, 14, 1, FACE), (9, 22, 14, 1, FACE)]
for y in range(8, 22, 3):
    ARIA += [(7, y, 1, 1, CIRCUIT), (6, y, 1, 1, DIM), (24, y, 1, 1, CIRCUIT), (25, y, 1, 1, DIM)]
for x in range(11, 21, 2):
    ARIA += [(x, 5, 1, 1, DIM), (x, 24, 1, 1, DIM)]
for x in (11, 18):
    ARIA += [(x, 12, 4, 3, "#ffffff")] + [(x + dx, 12 + dy, 1, 1, FACE) for dx, dy in ((0, 0), (3, 0), (0, 2), (3, 2))]
ARIA += [(12, 18, 8, 1, CIRCUIT), (15, 9, 2, 1, GLOW), (15, 21, 2, 1, GLOW)]


def pixels(rects, x0, y0, scale):
    return "\n".join(
        f'<rect x="{x0 + x * scale}" y="{y0 + y * scale}" width="{w * scale}" height="{h * scale}" fill="{c}"/>' for x, y, w, h, c in rects
    )


# Étoiles : semées par une suite fixe, pour une pochette identique à chaque génération.
stars, seed = [], 7
for _ in range(70):
    seed = (seed * 1103515245 + 12345) % 2**31
    x = seed % 512
    seed = (seed * 1103515245 + 12345) % 2**31
    y = seed % 360
    stars.append(f'<rect x="{x}" y="{y}" width="2" height="2" fill="#9dffb8" opacity="{0.25 + (seed % 60) / 100:.2f}"/>')

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SCAVENGERS" shape-rendering="crispEdges">
<defs>
  <radialGradient id="tube" cx=".5" cy=".42" r=".75"><stop stop-color="#0b2414"/><stop offset=".6" stop-color="#04100a"/><stop offset="1" stop-color="#010302"/></radialGradient>
  <radialGradient id="halo"><stop stop-color="#00e5ff" stop-opacity=".34"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="fade" x2="0" y2="1"><stop offset=".55" stop-color="#010302" stop-opacity="0"/><stop offset=".8" stop-color="#010302"/></linearGradient>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".3"/></pattern>
  <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="512" height="512" fill="url(#tube)"/>
{chr(10).join(stars)}
<!-- ARIA : son visage, immense, derrière Kael. -->
<circle cx="256" cy="186" r="250" fill="url(#halo)"/>
<g opacity=".5">
{pixels(ARIA, 256 - 16 * 14, 186 - 15 * 14, 14)}
</g>
<!-- Kael, devant. -->
<g>
{pixels(KAEL, 256 - 16 * 9, 112, 9)}
</g>
<rect width="512" height="512" fill="url(#fade)"/>
<rect width="512" height="512" fill="url(#scan)"/>
<!-- Le titre, comme au terminal. -->
<g font-family="'Courier New',Courier,monospace" font-weight="700" shape-rendering="auto">
  <text x="256" y="446" fill="#00ff41" font-size="62" text-anchor="middle" textLength="440" lengthAdjust="spacingAndGlyphs" filter="url(#glow)">SCAVENGERS</text>
  <text x="36" y="480" fill="#0c9a35" font-size="15" letter-spacing="3">&gt; BANDE ORIGINALE_</text>
  <text x="476" y="480" fill="#0c9a35" font-size="15" letter-spacing="3" text-anchor="end">OPTIMUSKOALA</text>
</g>
<path d="M18 46V18h28 M466 18h28v28 M494 466v28h-28 M46 494H18v-28" fill="none" stroke="#00ff41" stroke-width="3" opacity=".75"/>
</svg>
"""
OUT.write_text(svg, encoding="utf-8")
print(OUT, len(svg), "octets")
