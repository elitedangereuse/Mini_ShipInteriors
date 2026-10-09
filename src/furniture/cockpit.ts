import * as THREE from 'three'
import { animatedScreen, box, cylinder, drawnTexture, ED_ORANGE, glow, holoTime, lit, mat, mesh, part, type Builder } from './kit'
import { radar, seatCushion, seatLeather } from './elite'
import { tr } from '../i18n'

/*
 * Le poste de pilotage, d'après les cockpits d'Elite Dangerous : un tableau de bord qui enveloppe
 * le pilote, et au-dessus, projetés dans l'air, les instruments du jeu (le scanner au centre, la
 * cible et la chaleur à gauche, la vitesse, le vaisseau dans ses boucliers, le carburant et le
 * répartiteur de puissance à droite, les panneaux de navigation et des systèmes de part et
 * d'autre). Consoles d'équipage, sièges du copilote et du navigateur, fauteuil du commandant, et
 * le balisage lumineux du pont.
 */

const HUD = { orange: ED_ORANGE, pale: '#ffc98a', blue: '#58b8ff', red: '#ff4636', ink: '#1a0d02' }
const FONT = 'system-ui, "Segoe UI", sans-serif'
/** Carrosserie du tableau de bord : plus sombre que l'acier du reste du bord. */
const cowl = lit('#191c22', 'metal')

/**
 * Hologramme en couleurs (les instruments du jeu : orange, boucliers bleus, alertes rouges), avec
 * lignes de balayage. Lisible des deux côtés, comme `holoMaterial`.
 */
function hudMaterial(map: THREE.Texture, opacity = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: holoTime, uMap: { value: map }, uOpacity: { value: opacity } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
        vec4 c = texture2D(uMap, uv);
        float scan = 0.84 + 0.16 * sin(uv.y * 170.0 - uTime * 4.0);
        float flicker = 0.95 + 0.05 * sin(uTime * 19.0 + uv.y * 3.0);
        gl_FragColor = vec4(c.rgb, c.a * uOpacity * scan * flicker);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

// ---------------------------------------------------------------- instruments

/** Silhouette d'un vaisseau vu de dessus, nez en haut (un delta, comme le Cobra). */
const SHIP: [number, number][] = [[0, -22], [7, -9], [22, 9], [22, 16], [9, 13], [0, 18], [-9, 13], [-22, 16], [-22, 9], [-7, -9]]

function shipPath(g: CanvasRenderingContext2D, cx: number, cy: number, sx: number, sy = Math.abs(sx)) {
  g.beginPath()
  SHIP.forEach(([x, y], i) => (i ? g.lineTo(cx + x * sx, cy + y * sy) : g.moveTo(cx + x * sx, cy + y * sy)))
  g.closePath()
}

/** Cadre à coins coupés des panneaux du jeu, et son bandeau de titre (texte découpé dedans). */
function frame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, size = 11) {
  const cut = 8, bar = size + 6
  g.beginPath()
  g.moveTo(x + cut, y)
  g.lineTo(x + w, y)
  g.lineTo(x + w, y + h - cut)
  g.lineTo(x + w - cut, y + h)
  g.lineTo(x, y + h)
  g.lineTo(x, y + cut)
  g.closePath()
  g.globalAlpha = 0.14
  g.fill()
  g.globalAlpha = 0.9
  g.stroke()
  g.fillRect(x + cut, y + 3, w - cut - 3, bar)
  g.fillStyle = HUD.ink
  g.font = `700 ${size}px ${FONT}`
  g.fillText(title, x + cut + 4, y + 3 + bar / 2 + 1)
  g.fillStyle = HUD.orange
  g.globalAlpha = 1
}

const HUD_W = 768, HUD_H = 176

/**
 * Les instruments du pilote, sur une seule bande : de gauche à droite, les messages, la cible dans
 * ses boucliers, la chaleur, (le scanner, lui, est en relief au centre), la vitesse, le vaisseau
 * et son carburant, le répartiteur de puissance et ses voyants.
 */
function drawHud(g: CanvasRenderingContext2D, t: number) {
  g.clearRect(0, 0, HUD_W, HUD_H)
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.lineWidth = 2
  g.strokeStyle = g.fillStyle = HUD.orange

  // Messages : des lignes qui défilent.
  frame(g, 6, 14, 150, 110, 'INFO')
  for (let i = 0; i < 6; i++) {
    const k = i + Math.floor(t * 0.7)
    g.globalAlpha = i === 5 ? 1 : 0.55
    g.fillRect(16, 42 + i * 13, 34 + ((k * 53) % 90), 5)
  }
  g.globalAlpha = 1

  // La cible : un vaisseau en fil de fer qui tourne, dans ses anneaux de bouclier.
  const tx = 214, ty = 74
  g.strokeStyle = HUD.blue
  for (const r of [38, 44]) {
    g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.4 + r)
    g.beginPath()
    g.ellipse(tx, ty, r, r * 0.92, 0, Math.PI * 0.12, Math.PI * 1.88)
    g.stroke()
  }
  g.globalAlpha = 1
  g.strokeStyle = HUD.orange
  g.lineWidth = 1.5
  shipPath(g, tx, ty, Math.cos(t * 0.5) * 1.15, 1.15)
  g.stroke()
  g.lineWidth = 2
  g.font = `700 11px ${FONT}`
  g.textAlign = 'center'
  g.fillText('COBRA MK III', tx, 134)
  g.globalAlpha = 0.3
  g.fillRect(tx - 40, 146, 80, 6)
  g.globalAlpha = 1
  g.fillRect(tx - 40, 146, 80 * 0.86, 6)

  // Chaleur : une colonne graduée, qui monte et redescend.
  const heat = 0.34 + 0.12 * Math.sin(t * 0.35) + 0.04 * Math.sin(t * 1.9)
  g.strokeRect(274, 20, 14, 112)
  for (let i = 0; i < 14; i++) {
    const on = i / 14 < heat
    g.globalAlpha = on ? 1 : 0.2
    g.fillStyle = i > 10 ? HUD.red : HUD.orange
    g.fillRect(277, 124 - i * 8, 8, 5)
  }
  g.globalAlpha = 1
  g.fillStyle = HUD.orange
  g.fillText(`${Math.round(heat * 100)}%`, 281, 146)

  // Au-dessus du scanner : la destination, et le compas (un point qui dit où elle est).
  g.font = `700 13px ${FONT}`
  g.fillText('JAMESON MEMORIAL', 392, 16)
  g.font = `500 10px ${FONT}`
  g.globalAlpha = 0.8
  g.fillText('SHINRARTA DEZHRA · 12.4 LY', 392, 32)
  g.globalAlpha = 1
  g.beginPath()
  g.arc(318, 52, 13, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = HUD.pale
  g.beginPath()
  g.arc(318 + Math.cos(t * 0.4) * 6, 52 + Math.sin(t * 0.6) * 5, 3, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = HUD.orange
  // Les crochets qui encadrent le scanner.
  g.globalAlpha = 0.7
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(384 + s * 70, 62)
    g.lineTo(384 + s * 82, 74)
    g.lineTo(384 + s * 82, 150)
    g.lineTo(384 + s * 70, 162)
    g.stroke()
  }
  g.globalAlpha = 1

  // Vitesse : la colonne, sa zone bleue (la meilleure maniabilité), le repère des gaz.
  const speed = 0.55 + 0.2 * Math.sin(t * 0.22)
  g.globalAlpha = 0.22
  g.fillRect(482, 20, 14, 112)
  g.globalAlpha = 0.85
  g.fillStyle = HUD.blue
  g.fillRect(482, 20 + 112 * 0.4, 14, 112 * 0.2)
  g.fillStyle = HUD.orange
  g.globalAlpha = 1
  g.fillRect(482, 132 - 112 * speed, 14, 112 * speed * 0.08 + 3)
  g.beginPath()
  g.moveTo(500, 132 - 112 * 0.62)
  g.lineTo(508, 127 - 112 * 0.62)
  g.lineTo(508, 137 - 112 * 0.62)
  g.fill()
  g.font = `700 11px ${FONT}`
  g.fillText(`${Math.round(speed * 380)}`, 490, 146)

  // Le vaisseau, vu de dessus, dans ses trois anneaux de bouclier ; dessous, le carburant.
  const sx = 566, sy = 70
  g.strokeStyle = HUD.blue
  for (let i = 0; i < 3; i++) {
    g.globalAlpha = 0.45 + 0.35 * Math.sin(t * 1.1 - i * 0.9)
    g.beginPath()
    g.arc(sx, sy, 34 + i * 6, 0, Math.PI * 2)
    g.stroke()
  }
  g.globalAlpha = 1
  g.strokeStyle = HUD.orange
  shipPath(g, sx, sy, 1.05)
  g.globalAlpha = 0.35
  g.fill()
  g.globalAlpha = 1
  g.stroke()
  g.textAlign = 'left'
  g.font = `700 9px ${FONT}`
  g.fillText('FUEL', 524, 134)
  g.globalAlpha = 0.3
  g.fillRect(552, 130, 58, 7)
  g.fillRect(552, 142, 58, 4)
  g.globalAlpha = 1
  g.fillRect(552, 130, 58 * 0.78, 7)
  g.fillRect(552, 142, 58 * (0.4 + 0.5 * ((t * 0.05) % 1)), 4)

  // Répartiteur de puissance : SYS, ENG, WEP, leurs réserves et leurs pips, qui changent de temps en temps.
  const pips = [[2, 2, 2], [1, 4, 1], [2, 2, 2], [4, 1, 1], [0, 3, 3]][Math.floor(t / 7) % 5]
  g.font = `700 10px ${FONT}`
  g.textAlign = 'center'
  ;['SYS', 'ENG', 'WEP'].forEach((label, i) => {
    const x = 644 + i * 30
    const level = 0.5 + 0.45 * Math.sin(t * 0.3 + i * 2.1) ** 2
    g.globalAlpha = 0.25
    g.fillRect(x - 9, 20, 18, 60)
    g.globalAlpha = 1
    g.fillRect(x - 9, 80 - 60 * level, 18, 60 * level)
    for (let p = 0; p < 4; p++) {
      g.globalAlpha = p < pips[i] ? 1 : 0.22
      g.fillRect(x - 9, 86 + p * 7, 18, 4)
    }
    g.globalAlpha = 1
    g.fillText(label, x, 124)
  })
  // Voyants : masse verrouillée, train, écope.
  g.textAlign = 'left'
  g.font = `700 8px ${FONT}`
  ;[['MASS LOCKED', true], ['LANDING GEAR', false], ['CARGO SCOOP', false]].forEach(([label, on], i) => {
    g.globalAlpha = on ? 1 : 0.35
    g.fillStyle = on ? HUD.blue : HUD.orange
    g.fillRect(630, 136 + i * 12, 8, 8)
    g.fillText(label as string, 643, 141 + i * 12)
  })
  g.globalAlpha = 1
}

/**
 * Panneau latéral du jeu : une rangée d'onglets, une liste, une ligne choisie en plein.
 * @param rows « libellé|valeur », la deuxième est la ligne choisie
 */
function sidePanel(tabs: string[], rows: string[]): THREE.CanvasTexture {
  return drawnTexture(384, 256, (g) => {
    g.textBaseline = 'middle'
    g.lineWidth = 2
    g.strokeStyle = g.fillStyle = HUD.orange
    g.globalAlpha = 0.1
    g.fillRect(0, 0, 384, 256)
    g.globalAlpha = 1
    // Onglets : le premier est ouvert.
    const tw = 372 / tabs.length
    g.font = `700 ${tabs.length > 3 ? 10 : 13}px ${FONT}`
    g.textAlign = 'center'
    tabs.forEach((tab, i) => {
      const x = 6 + i * tw
      if (i === 0) g.fillRect(x, 6, tw - 4, 26)
      else g.strokeRect(x, 6, tw - 4, 26)
      g.fillStyle = i === 0 ? HUD.ink : HUD.orange
      g.fillText(tab, x + tw / 2 - 2, 20)
      g.fillStyle = HUD.orange
    })
    g.fillRect(6, 38, 372, 3)
    g.font = `600 16px ${FONT}`
    rows.forEach((row, i) => {
      const [label, value = ''] = row.split('|')
      const y = 50 + i * 32
      if (i === 1) g.fillRect(6, y, 372, 27)
      else {
        g.globalAlpha = 0.16
        g.fillRect(6, y, 372, 27)
        g.globalAlpha = 1
      }
      g.fillStyle = i === 1 ? HUD.ink : HUD.orange
      // Le losange de la ligne, comme devant chaque destination du jeu.
      g.beginPath()
      g.moveTo(22, y + 6)
      g.lineTo(30, y + 14)
      g.lineTo(22, y + 22)
      g.lineTo(14, y + 14)
      g.fill()
      g.textAlign = 'left'
      g.fillText(label, 40, y + 15)
      g.textAlign = 'right'
      g.fillText(value, 370, y + 15)
      g.fillStyle = HUD.orange
    })
  })
}

/** Petit écran encastré (canvas animé à 6 images/s) : route, jauges, messages, signal. */
function dashScreen(kind: 'nav' | 'sys' | 'comms' | 'scan', seed: number) {
  const s = animatedScreen(128, 80, 6, (g, t) => {
    g.fillStyle = '#120802'
    g.fillRect(0, 0, 128, 80)
    g.strokeStyle = g.fillStyle = ED_ORANGE
    g.lineWidth = 2
    g.fillRect(4, 4, 120, 9)
    if (kind === 'nav') {
      // La route : des sauts d'étoile en étoile, et le vaisseau qui avance dessus.
      const stops: [number, number][] = [[14, 62], [40, 34], [70, 50], [96, 26], [116, 40]]
      g.globalAlpha = 0.6
      g.beginPath()
      stops.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      g.globalAlpha = 1
      for (const [x, y] of stops) g.fillRect(x - 3, y - 3, 6, 6)
      const k = ((t * 0.12 + seed) % 1) * (stops.length - 1), i = Math.floor(k), f = k - i
      const [ax, ay] = stops[i], [bx, by] = stops[i + 1]
      g.fillStyle = '#8ff0ff'
      g.fillRect(ax + (bx - ax) * f - 3, ay + (by - ay) * f - 3, 6, 6)
    } else if (kind === 'sys') {
      // Modules : une ligne par module, sa puissance en barre.
      for (let i = 0; i < 5; i++) {
        const v = 0.55 + 0.4 * Math.abs(Math.sin(t * 0.4 + i * 1.7 + seed))
        g.globalAlpha = 0.3
        g.fillRect(8, 20 + i * 11, 112, 7)
        g.globalAlpha = 0.95
        g.fillRect(8, 20 + i * 11, 112 * v, 7)
      }
    } else if (kind === 'comms') {
      // Messages qui défilent.
      for (let i = 0; i < 6; i++) {
        const w = 30 + ((i * 37 + Math.floor(t * 2) * 13 + Math.floor(seed * 7)) % 80)
        g.globalAlpha = i === 5 ? 1 : 0.6
        g.fillRect(8, 19 + i * 10, w, 4)
      }
    } else {
      // Signal du scanner : une onde qui défile.
      g.beginPath()
      for (let x = 8; x < 120; x += 2) {
        const y = 46 + Math.sin(x * 0.12 + t * 3 + seed) * 14 * Math.sin(x * 0.03 + t * 0.7)
        if (x === 8) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    }
    g.globalAlpha = 1
  })
  return s
}

// ---------------------------------------------------------------- pupitres

/**
 * Pan de pupitre (face à +z) : un caisson, une planche inclinée vers l'opérateur, une casquette
 * au fond, un liseré lumineux au bord. Rend la planche, pour y poser écrans et boutons (repère de
 * la planche : y vers le haut de sa surface, z vers l'opérateur).
 */
function desk(g: THREE.Group, w: number): THREE.Group {
  g.add(box(w, 0.38, 0.34, cowl, 0, 0.19, -0.03, 0.03))
  g.add(box(w - 0.12, 0.1, 0.06, mat.steelDark, 0, 0.1, 0.15, 0.02))
  const board = new THREE.Group()
  board.position.set(0, 0.43, 0.01)
  board.rotation.x = 0.42
  board.add(box(w + 0.02, 0.05, 0.46, mat.steelDark, 0, 0, 0, 0.02))
  board.add(box(w - 0.04, 0.012, 0.014, glow(ED_ORANGE), 0, 0.012, 0.228))
  g.add(board)
  // Casquette : elle abrite les écrans des reflets de la verrière.
  g.add(box(w + 0.02, 0.13, 0.07, cowl, 0, 0.54, -0.2, 0.03))
  return board
}

/** Écran encastré à plat sur une planche de pupitre, dans son cadre. */
function inset(board: THREE.Group, live: THREE.Group, updates: ((t: number) => void)[], kind: Parameters<typeof dashScreen>[0], seed: number, x: number, z: number, w = 0.3, d = 0.19) {
  board.add(box(w + 0.03, 0.012, d + 0.03, cowl, x, 0.026, z))
  const s = dashScreen(kind, seed)
  const p = part(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: s.texture }), x, 0.034, z)
  p.rotation.x = -Math.PI / 2
  // L'écran suit la planche, mais reste une pièce à part (sa texture s'anime).
  const holder = new THREE.Group()
  holder.position.copy(board.position)
  holder.rotation.copy(board.rotation)
  board.parent!.updateMatrix()
  holder.applyMatrix4(board.parent!.matrix)
  holder.add(p)
  live.add(holder)
  updates.push(s.tick)
}

/** Rangée de touches sur une planche : la plupart orange, quelques-unes d'une autre couleur. */
function keys(board: THREE.Group, n: number, x: number, z: number, accent: THREE.Material, random: () => number, step = 0.05) {
  for (let i = 0; i < n; i++) board.add(box(0.032, 0.014, 0.032, random() < 0.25 ? accent : random() < 0.5 ? mat.lamp : mat.steel, x + i * step, 0.03, z))
}

/**
 * Tableau de bord du pilote (2,2 de large) : trois pans qui enveloppent le siège, le puits du
 * scanner au centre, et les instruments projetés au-dessus. L'opérateur est côté +z, à 1,2.
 */
const helmConsole: Builder = (o) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  const updates: ((t: number) => void)[] = []
  // Le pan central, face au siège, et le puits du scanner (une platine cerclée d'orange).
  const centre = new THREE.Group()
  g.add(centre)
  const board = desk(centre, 0.96)
  const well = cylinder(0.3, 0.33, 0.035, cowl, 0, 0.035, 0.02, 32)
  well.scale.z = 0.62
  const rim = mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 40), glow(ED_ORANGE), 0, 0.055, 0.02)
  rim.rotation.x = Math.PI / 2
  rim.scale.y = 0.62
  board.add(well, rim)
  keys(board, 3, -0.44, 0.17, mat.lampCyan, o.random)
  keys(board, 3, 0.34, 0.17, mat.lampRed, o.random)
  // Les ailes, tournées vers le pilote : un écran et deux rangées de touches chacune.
  for (const s of [-1, 1]) {
    const wing = new THREE.Group()
    wing.position.set(s * 0.8, 0, 0.2)
    wing.rotation.y = -s * 0.6
    g.add(wing)
    const wb = desk(wing, 0.72)
    inset(wb, live, updates, s < 0 ? 'comms' : 'sys', s + 2, -s * 0.14, -0.04)
    keys(wb, 4, s < 0 ? -0.31 : 0.16, -0.09, mat.lampCyan, o.random)
    keys(wb, 4, s < 0 ? -0.31 : 0.16, -0.03, mat.lampGreen, o.random)
    keys(wb, 9, -0.2, 0.14, mat.lampRed, o.random)
    // Le pied du pan, côté coursive : un bandeau orange au ras du sol.
    wing.add(box(0.6, 0.014, 0.014, glow(ED_ORANGE), 0, 0.05, 0.185))
  }
  centre.add(box(0.84, 0.014, 0.014, glow(ED_ORANGE), 0, 0.05, 0.185))

  // Le scanner, en relief au-dessus de son puits.
  const scanner = radar(o)
  scanner.live!.position.y = -0.44
  const tilted = new THREE.Group()
  tilted.position.set(0, 0.66, 0.06)
  tilted.rotation.x = 0.3
  tilted.add(scanner.live!)
  live.add(tilted)
  updates.push(scanner.update!)

  // Les instruments : une bande d'hologrammes courbée autour du pilote.
  const hud = animatedScreen(HUD_W, HUD_H, 8, drawHud)
  hud.texture.magFilter = THREE.LinearFilter
  const arc = 1.75, radius = 1.02, height = (radius * arc * HUD_H) / HUD_W
  const band = part(new THREE.CylinderGeometry(radius, radius, height, 40, 1, true, Math.PI - arc / 2, arc), hudMaterial(hud.texture), 0, 0.57 + height / 2, 1.0)
  live.add(band)
  updates.push(hud.tick)

  // Les deux panneaux du jeu, à portée de main : navigation à gauche, systèmes à droite.
  const nav = sidePanel(
    ['NAVIGATION', 'TRANSACTIONS', 'CONTACTS'],
    ['SHINRARTA DEZHRA A|0.0 LS', 'JAMESON MEMORIAL|347 LS', 'FOUNDERS WORLD|412 LS', 'SOL|8.6 LY', 'ACHENAR|143 LY', 'COLONIA|22 000 LY'],
  )
  const sys = sidePanel(
    [tr('ACCUEIL', 'HOME'), 'MODULES', tr('GROUPES', 'FIRE GRP'), tr('VAISSEAU', 'SHIP'), tr('INVENTAIRE', 'INVENTORY')],
    [tr('GÉNÉRATEUR|100 %', 'POWER PLANT|100%'), tr('RÉACTEUR FSD|100 %', 'FRAME SHIFT DRIVE|100%'), tr('PROPULSEURS|100 %', 'THRUSTERS|100%'), tr('BOUCLIERS|100 %', 'SHIELD GENERATOR|100%'), tr('SUPPORT VITAL|100 %', 'LIFE SUPPORT|100%'), tr('CAPTEURS|100 %', 'SENSORS|100%')],
  )
  const panels = ([[-1, nav], [1, sys]] as const).map(([s, map]) => {
    const p = part(new THREE.PlaneGeometry(0.57, 0.38), hudMaterial(map, 0.95), s * 0.97, 0.86, 0.92)
    p.rotation.set(-0.1, -s * 0.95, 0, 'YXZ')
    live.add(p)
    return p
  })
  return {
    solid: g,
    live,
    update: (t) => {
      updates.forEach((u) => u(t))
      panels.forEach((p, i) => (p.position.y = 0.86 + Math.sin(t * 1.1 + i * 2) * 0.006))
    },
  }
}

/** Instrument d'un poste d'équipage : une petite bande d'hologrammes, selon le poste. */
function crewHud(kind: 'nav' | 'comms' | 'scan'): THREE.CanvasTexture {
  return drawnTexture(320, 112, (g) => {
    g.textBaseline = 'middle'
    g.lineWidth = 2
    g.strokeStyle = g.fillStyle = HUD.orange
    frame(g, 4, 6, 312, 100, kind === 'nav' ? tr('ROUTE', 'ROUTE') : kind === 'comms' ? 'COMMS' : tr('CAPTEURS', 'SENSORS'), 12)
    if (kind === 'nav') {
      // Trois sauts, de l'étoile de départ à la destination.
      const stops = [30, 115, 200, 285]
      g.fillRect(30, 62, 255, 2)
      stops.forEach((x, i) => {
        g.fillStyle = i === 0 ? HUD.blue : HUD.orange
        g.beginPath()
        g.arc(x, 63, i === 3 ? 9 : 6, 0, Math.PI * 2)
        g.fill()
      })
      g.fillStyle = HUD.orange
      g.font = `600 11px ${FONT}`
      g.fillText(tr('3 SAUTS · 12.4 AL', '3 JUMPS · 12.4 LY'), 30, 90)
    } else if (kind === 'comms') {
      g.font = `600 11px ${FONT}`
      ;['FELICITY FARSEER', 'JAMESON CONTROL', 'CMDR ...'].forEach((who, i) => {
        g.globalAlpha = i === 0 ? 1 : 0.6
        g.fillText(who, 16, 42 + i * 20)
        g.fillRect(140, 39 + i * 20, 60 + ((i * 47) % 90), 5)
      })
      g.globalAlpha = 1
    } else {
      // Le spectre du scanner d'exploration : des pics, et le curseur accordé sur l'un d'eux.
      for (let x = 16; x < 304; x += 6) {
        const h = 6 + 34 * Math.abs(Math.sin(x * 0.05) * Math.sin(x * 0.013 + 1))
        g.fillRect(x, 92 - h, 4, h)
      }
      g.strokeStyle = HUD.blue
      g.strokeRect(120, 36, 40, 60)
    }
  })
}

/** Console d'équipage (0,8 de large) : un pupitre, deux écrans, des touches, et son instrument projeté au-dessus. */
const sideConsole: Builder = ({ label = 'nav', random }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  const updates: ((t: number) => void)[] = []
  const board = desk(g, 0.8)
  const kind = label === 'comms' ? 'comms' : label === 'scan' ? 'scan' : 'nav'
  inset(board, live, updates, kind, random() * 6, -0.2, -0.04, 0.3, 0.19)
  inset(board, live, updates, kind === 'nav' ? 'sys' : 'nav', random() * 6, 0.2, -0.04, 0.3, 0.19)
  keys(board, 14, -0.33, 0.14, mat.lampGreen, random)
  g.add(box(0.7, 0.014, 0.014, glow(ED_ORANGE), 0, 0.05, 0.185))
  const holo = part(new THREE.PlaneGeometry(0.66, 0.23), hudMaterial(crewHud(kind), 0.95), 0, 0.76, -0.16)
  holo.rotation.x = -0.2
  live.add(holo)
  return { solid: g, live, update: (t) => updates.forEach((u) => u(t)) }
}

/** Siège d'équipage (copilote, navigateur) : dossier haut, liserés orange, sans HOTAS. */
const crewSeat: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.3, 0.04, 0.5, mat.steelDark, 0, 0.02, 0, 0.01), box(0.2, 0.14, 0.26, mat.steel, 0, 0.11, 0, 0.02))
  g.add(box(0.48, 0.11, 0.46, seatLeather, 0, 0.24, 0.02, 0.04))
  const back = box(0.48, 0.58, 0.11, seatLeather, 0, 0.55, -0.2, 0.05)
  back.rotation.x = -0.14
  g.add(back)
  const spine = box(0.2, 0.44, 0.03, seatCushion, 0, 0.55, -0.145, 0.012)
  spine.rotation.x = -0.14
  g.add(spine, box(0.26, 0.13, 0.09, seatLeather, 0, 0.9, -0.27, 0.04))
  for (const x of [-0.17, 0.17]) {
    const strip = box(0.03, 0.46, 0.02, mat.trim, x, 0.55, -0.14)
    strip.rotation.x = -0.14
    g.add(strip)
  }
  for (const x of [-0.27, 0.27]) g.add(box(0.07, 0.06, 0.38, mat.steel, x, 0.34, 0, 0.02))
  return { solid: g }
}

/**
 * Fauteuil du commandant, sur son estrade ronde : accoudoirs à écrans, repose-tête, et une
 * plaque « CMDR » sur le dossier.
 */
const commandChair: Builder = () => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  g.add(cylinder(0.5, 0.54, 0.08, mat.steelDark, 0, 0.04, 0, 28))
  const ring = mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 40), glow(ED_ORANGE), 0, 0.08, 0)
  ring.rotation.x = Math.PI / 2
  g.add(ring)
  g.add(cylinder(0.12, 0.16, 0.16, mat.steel, 0, 0.16, 0, 12))
  g.add(box(0.56, 0.12, 0.52, lit('#2a1a12'), 0, 0.3, 0.02, 0.05))
  const back = box(0.58, 0.7, 0.13, lit('#2a1a12'), 0, 0.68, -0.23, 0.06)
  back.rotation.x = -0.12
  g.add(back)
  g.add(box(0.34, 0.16, 0.12, lit('#2a1a12'), 0, 1.08, -0.3, 0.05))
  g.add(box(0.2, 0.05, 0.02, mat.trim, 0, 0.92, -0.22))
  for (const x of [-0.34, 0.34]) {
    g.add(box(0.12, 0.08, 0.5, mat.steel, x, 0.44, 0.02, 0.03))
    const pad = part(new THREE.PlaneGeometry(0.09, 0.14), glow('#ffb05c'), x, 0.49, 0.1)
    pad.rotation.x = -Math.PI / 2
    live.add(pad)
  }
  return { solid: g, live }
}

/**
 * Balisage du pont (7 × 1,3, le long de x, centré sur la carte galactique) : deux lignes
 * lumineuses qui mènent de la porte au siège du pilote, et s'écartent en cercle autour de la carte.
 * À plat sur le sol : on marche dessus.
 */
const bridgeGuides: Builder = () => {
  const g = new THREE.Group()
  const line = glow(ED_ORANGE), tick = glow('#a8560f'), y = 0.007, off = 0.62, r = 0.86
  // Là où les lignes rejoignent le cercle.
  const join = Math.sqrt(r * r - off * off)
  for (const s of [-1, 1]) {
    g.add(box(2.9 - join, 0.004, 0.028, line, -(2.9 + join) / 2, y, s * off))
    g.add(box(2.6 - join, 0.004, 0.028, line, (2.6 + join) / 2, y, s * off))
    // L'arc du cercle, de ce côté.
    const a = Math.atan2(off, join)
    g.add(part(new THREE.RingGeometry(r - 0.014, r + 0.014, 40, 1, s > 0 ? Math.PI + a : a, Math.PI - 2 * a).rotateX(-Math.PI / 2), line, 0, y + 0.002, 0))
    // Graduations, tous les demi-mètres.
    for (let x = -2.75; x <= 2.5; x += 0.5) if (Math.abs(x) > r + 0.1) g.add(box(0.02, 0.004, 0.09, tick, x, y, s * (off - 0.06)))
  }
  // Chevrons vers la proue, à l'entrée.
  for (const x of [-2.45, -2.25, -2.05]) {
    for (const s of [-1, 1]) {
      const c = box(0.2, 0.004, 0.028, tick, x, y, s * 0.066)
      c.rotation.y = s * 0.75
      g.add(c)
    }
  }
  return { solid: g }
}

export const COCKPIT = {
  'helm-console': helmConsole,
  'side-console': sideConsole,
  'crew-seat': crewSeat,
  'command-chair': commandChair,
  'bridge-guides': bridgeGuides,
} satisfies Record<string, Builder>
