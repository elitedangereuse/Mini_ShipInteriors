#!/usr/bin/env python3
"""Draw original vector sleeves for the nine legacy jukebox tracks."""

from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public/assets/music/covers"

# Compact, legible art for the 64 px cards and the larger now-playing sleeve.
COVERS = {
    "danube": ("BLUE DANUBE", "U.S. MARINE BAND", "#101b36", "#658cbd", "#d9c394", """
      <circle cx="256" cy="232" r="132" fill="none" stroke="#d9c394" stroke-width="2" opacity=".55"/>
      <circle cx="256" cy="232" r="106" fill="none" stroke="#d9c394" stroke-width="1" opacity=".4"/>
      <path d="M55 240 C110 175 160 330 220 245 S330 170 455 248 M55 270 C110 205 160 360 220 275 S330 200 455 278" fill="none" stroke="#f6e6c4" stroke-width="7" opacity=".78"/>
      <path d="M82 196 C170 125 276 141 411 189" fill="none" stroke="#d9c394" stroke-width="2" opacity=".65"/>
    """),
    "disco": ("FUNKY DISCO", "FUPI", "#271335", "#a54083", "#ffcc69", """
      <circle cx="256" cy="231" r="124" fill="#df91bd" opacity=".18" stroke="#ffcc69" stroke-width="3"/>
      <path d="M132 231h248 M150 181h212 M150 281h212 M180 137h152 M180 325h152 M206 114v234 M256 107v248 M306 114v234" stroke="#ffd89a" stroke-width="5" opacity=".72"/>
      <path d="m78 130 8 21 21 8-21 8-8 21-8-21-21-8 21-8z M420 248l7 18 18 7-18 7-7 18-7-18-18-7 18-7z" fill="#fff2cf"/>
    """),
    "synthwave": ("DAY DREAMS", "HOLIZNACC0", "#211438", "#a63a89", "#ff9e70", """
      <circle cx="256" cy="205" r="108" fill="#ff9e70" opacity=".86"/>
      <path d="M148 220h216 M155 239h202 M169 256h174 M191 272h130" stroke="#3d1c54" stroke-width="8"/>
      <path d="M0 306h512 M256 306 28 420 M256 306 484 420 M256 306 110 420 M256 306 402 420 M0 342h512 M0 387h512" stroke="#ff8caa" stroke-width="3" opacity=".75" fill="none"/>
    """),
    "lofi": ("CHILLS", "HOLIZNACC0", "#132b3b", "#518089", "#f2c597", """
      <rect x="133" y="89" width="246" height="262" rx="8" fill="#102132" stroke="#e2b18c" stroke-width="7"/>
      <path d="M256 92v257 M136 219h240" stroke="#d3af93" stroke-width="7"/>
      <circle cx="311" cy="155" r="33" fill="#efb479"/>
      <path d="M164 292c23-23 45-4 58-23s36-15 51 4 45-17 79 10" fill="none" stroke="#79b0ae" stroke-width="13" opacity=".65"/>
      <path d="m111 99-12 35 m32 21-11 36 m280-81-10 30 m-13 118-14 39" stroke="#c1d8d1" stroke-width="4" opacity=".5"/>
    """),
    "space": ("GANYMEDE", "CONGUSBONGUS", "#101a39", "#475f9d", "#d4b3fc", """
      <ellipse cx="259" cy="239" rx="194" ry="58" transform="rotate(-21 259 239)" fill="none" stroke="#bdaaf3" stroke-width="16" opacity=".56"/>
      <circle cx="257" cy="235" r="105" fill="#8398c8"/>
      <path d="M183 165c27 38 35 69 27 119 M277 136c18 50 26 112 15 199" stroke="#dce4ff" stroke-width="15" opacity=".23" fill="none"/>
      <path d="M76 117h8 M407 133h8 M384 339h8 M120 321h8" stroke="#fff" stroke-width="5"/>
    """),
    "chiptune": ("INTERSTELLAR", "ZANE LITTLE MUSIC", "#152543", "#44799b", "#8affd2", """
      <path d="M220 124h72v28h27v39h27v66h-45v36h-90v-36h-45v-66h27v-39h27z" fill="#8affd2"/>
      <path d="M229 181h22v22h-22z M265 181h22v22h-22z M211 239h90v17h-90z" fill="#183451"/>
      <path d="M199 291h29v42h-29z M284 291h29v42h-29z" fill="#ffbb76"/>
      <path d="M96 180h17v17H96z M381 118h17v17h-17z M382 288h17v17h-17z M130 312h17v17h-17z" fill="#e4f9fa"/>
    """),
    "lounge": ("TWO LEFT SOCKS", "CONGUSBONGUS", "#46302c", "#a27055", "#ffe0ad", """
      <path d="M158 137h196l-60 123h-76z" fill="#f8d7aa" opacity=".72" stroke="#fff1d5" stroke-width="6"/>
      <path d="M216 263h80 M256 263v63 M205 328h102" stroke="#ffe8c8" stroke-width="9" stroke-linecap="round"/>
      <circle cx="294" cy="182" r="22" fill="#ee916a"/>
      <path d="M117 196c25-22 33-22 54 0 M342 204c20-18 37-18 55 0" stroke="#ffe2b7" stroke-width="5" fill="none" opacity=".6"/>
    """),
    "fight-left": ("ALL THE FIGHT LEFT", "HOLIZNACC0", "#241728", "#8f3351", "#ff9c9f", """
      <circle cx="256" cy="220" r="113" fill="#ff858e" opacity=".3"/>
      <path d="M73 310 172 213l46 39 83-129 137 187" stroke="#ffd6bd" stroke-width="12" fill="none" stroke-linejoin="round"/>
      <path d="M65 338h382 M106 353h300" stroke="#ee8294" stroke-width="4" opacity=".7"/>
      <path d="m379 109 28 24-28 24-28-24z" fill="#ffb5b2"/>
    """),
    "synesthesia": ("SYNESTHESIA", "ZANE LITTLE MUSIC", "#172037", "#6352a5", "#f7b8e9", """
      <circle cx="256" cy="220" r="118" fill="none" stroke="#f7b8e9" stroke-width="18" opacity=".85"/>
      <circle cx="256" cy="220" r="81" fill="none" stroke="#72e4ed" stroke-width="18" opacity=".85"/>
      <circle cx="256" cy="220" r="45" fill="#ffe2aa" opacity=".9"/>
      <path d="M59 194c41-51 69-56 112-30 M358 292c42-1 64-18 97-69" stroke="#f7b8e9" stroke-width="7" fill="none" opacity=".65"/>
    """),
}


def svg(title: str, artist: str, dark: str, mid: str, accent: str, motif: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="{escape(title)}">
<defs>
  <linearGradient id="bg" x2="1" y2="1"><stop stop-color="{dark}"/><stop offset="1" stop-color="{mid}"/></linearGradient>
  <radialGradient id="light"><stop stop-color="{accent}" stop-opacity=".24"/><stop offset="1" stop-color="{accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" fill="url(#bg)"/>
<circle cx="256" cy="220" r="250" fill="url(#light)"/>
<path d="M27 27h458v458H27z" fill="none" stroke="{accent}" stroke-opacity=".47" stroke-width="2"/>
{motif.strip()}
<rect x="0" y="386" width="512" height="126" fill="{dark}" opacity=".9"/>
<path d="M28 388h456" stroke="{accent}" stroke-width="3"/>
<text x="32" y="74" fill="{accent}" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" letter-spacing="7">JUKEBOX · ÉLITE</text>
<text x="32" y="433" fill="#fff9ed" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="700" letter-spacing="1.4">{escape(title)}</text>
<text x="32" y="466" fill="{accent}" font-family="Arial,Helvetica,sans-serif" font-size="15" letter-spacing="3">{escape(artist)}</text>
</svg>
'''


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, values in COVERS.items():
        (OUT / f"{name}.svg").write_text(svg(*values), encoding="utf-8")
