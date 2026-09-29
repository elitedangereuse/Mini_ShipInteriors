import * as THREE from 'three'
import { barX, barZ, box, cylinder, drawnTexture, glass, glow, lit, mesh, part, sphere, type Builder } from './kit'
import { tr } from '../i18n'
import { menuDate, menuOf } from '../menu'

/*
 * Le mess du pont principal, devenu un self : tables de cantine à bancs, comptoir de service
 * (plateaux, bain-marie, passe du chef, desserts, pain et boissons), et au fond la cuisine de
 * Marcel : frigo, plan de travail, fourneau sous sa hotte, plonge et garde-manger. Aussi le
 * tableau du menu du jour, la fontaine à eau et le retour plateaux.
 */

const C = {
  steel: '#c6ccd4',
  steelMid: '#9aa3ae',
  steelDark: '#565e69',
  black: '#1b1d22',
  laminate: '#e9ecef',
  white: '#f4f6f8',
  orange: '#e0701e',
  orangeLight: '#ff8a1c',
  tile: '#dbe4e8',
  tileLine: '#aebcc3',
  wood: '#b07a45',
  tray: '#3a3f48',
  plate: '#f2f0ea',
}

/** Couleurs de la nourriture : ragoût, haricots, purée, curry, riz, baies, salade, carotte. */
const FOOD = ['#9a4a24', '#4f8a3a', '#f0d27a', '#d9861e', '#f3eddc', '#7a2a6b', '#6fb04a', '#e8772a']

const pick = <T,>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)]

/** Crédence carrelée derrière un meuble adossé au mur (dos à -z). */
function splashback(g: THREE.Group, w: number, d: number, from = 0.46, to = 0.86) {
  const z = -d / 2 - 0.005
  g.add(box(w, to - from, 0.012, lit(C.tile), 0, (from + to) / 2, z))
  for (let y = from + 0.1; y < to - 0.02; y += 0.1) g.add(box(w, 0.004, 0.004, lit(C.tileLine), 0, y, z + 0.007))
  for (let x = -w / 2 + 0.1; x < w / 2 - 0.02; x += 0.1) g.add(box(0.004, to - from, 0.004, lit(C.tileLine), x, (from + to) / 2, z + 0.007))
}

/** Caisson inox d'un meuble de cuisine : corps, socle noir, plan de travail (dessus à 0,46). */
function carcass(g: THREE.Group, w: number, d: number) {
  g.add(box(w, 0.4, d - 0.02, lit(C.steelMid), 0, 0.23, -0.01))
  g.add(box(w - 0.02, 0.05, d - 0.06, lit(C.black), 0, 0.025, -0.02))
  g.add(box(w + 0.02, 0.03, d, lit(C.steel), 0, 0.445, 0))
}

/** Assiette posée (dessus à y), avec de quoi manger dessus si `food`. */
function plate(g: THREE.Group, x: number, y: number, z: number, food?: string) {
  g.add(cylinder(0.05, 0.04, 0.012, lit(C.plate), x, y + 0.006, z, 12))
  if (food) g.add(cylinder(0.03, 0.035, 0.018, lit(food), x, y + 0.02, z, 10))
}

// ---------------------------------------------------------------- salle

/**
 * Table de cantine à bancs, en longueur le long de x : plateau stratifié liseré d'orange Elite,
 * pieds en T qui portent aussi les deux bancs, huilier au centre et chevalet au numéro de la
 * table. Trois places par banc (cf. seats.ts). `label` : numéro de la table.
 */
const canteenTable: Builder = ({ label, random }) => {
  const L = 2
  const g = new THREE.Group()
  const frame = lit(C.steelDark), orange = lit(C.orange)
  g.add(box(L, 0.035, 0.62, lit(C.laminate), 0, 0.4, 0, 0.01))
  for (const z of [-0.315, 0.315]) g.add(box(L + 0.01, 0.014, 0.012, orange, 0, 0.395, z))
  for (const x of [-L / 2 + 0.28, L / 2 - 0.28]) {
    g.add(box(0.06, 0.37, 0.06, frame, x, 0.2, 0), box(0.07, 0.03, 1.36, frame, x, 0.015, 0))
    for (const z of [-0.6, 0.6]) g.add(box(0.05, 0.22, 0.05, frame, x, 0.12, z))
  }
  // Les bancs : assise orange, chant inox.
  for (const z of [-0.6, 0.6]) {
    g.add(box(L, 0.04, 0.22, orange, 0, 0.245, z, 0.01), box(L, 0.012, 0.012, lit(C.steel), 0, 0.23, z + Math.sign(z) * 0.105))
  }
  // Huilier : serviettes, sel, poivre, sauce piquante d'Ochoeng.
  const cx = (random() - 0.5) * 0.3
  g.add(box(0.09, 0.07, 0.04, lit(C.steel), cx, 0.452, 0), box(0.07, 0.05, 0.03, lit(C.white), cx, 0.455, 0))
  g.add(cylinder(0.012, 0.014, 0.05, lit(C.white), cx + 0.08, 0.442, 0.02, 8), cylinder(0.012, 0.014, 0.05, lit(C.black), cx + 0.08, 0.442, -0.02, 8))
  g.add(cylinder(0.014, 0.016, 0.08, lit('#c8321e'), cx - 0.08, 0.457, 0, 8), cylinder(0.006, 0.01, 0.025, lit(C.white), cx - 0.08, 0.51, 0, 6))
  // Chevalet au numéro de la table, lisible des deux bancs.
  if (label) {
    const card = drawnTexture(128, 64, (c) => {
      c.fillStyle = '#1b1d22'
      c.fillRect(0, 0, 128, 64)
      c.fillStyle = C.orangeLight
      c.fillRect(0, 0, 128, 6)
      c.font = '800 34px system-ui, sans-serif'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillStyle = '#ffe2bf'
      c.fillText(`TABLE ${label}`, 64, 38)
    })
    const m = new THREE.MeshLambertMaterial({ map: card })
    for (const side of [1, -1]) {
      const face = mesh(new THREE.PlaneGeometry(0.11, 0.055), m, cx + 0.2, 0.45, side * 0.012)
      face.rotation.set(-side * 0.35, side > 0 ? 0 : Math.PI, 0)
      g.add(face)
    }
  }
  return { solid: g }
}

/**
 * Fontaine à eau, adossée au mur (dos à -z) : meuble blanc, bonbonne bleue retournée, deux
 * robinets (froid, chaud), égouttoir, et le distributeur de gobelets sur le flanc.
 */
const waterFountain: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.36, 0.55, 0.3, lit(C.white), 0, 0.275, 0, 0.02), box(0.3, 0.1, 0.02, lit(C.steelMid), 0, 0.42, 0.151))
  g.add(box(0.2, 0.012, 0.08, lit(C.steelDark), 0, 0.33, 0.13), box(0.14, 0.03, 0.03, lit('#27c6ff'), 0, 0.49, 0.155))
  for (const [x, c] of [[-0.06, '#2f7de0'], [0.06, '#d8323c']] as const) g.add(box(0.03, 0.035, 0.04, lit(c), x, 0.4, 0.17))
  g.add(cylinder(0.035, 0.035, 0.22, lit(C.steel), 0.2, 0.36, 0.05, 10))
  for (let i = 0; i < 5; i++) g.add(cylinder(0.032, 0.026, 0.02, lit(C.white), 0.2, 0.24 - i * 0.012, 0.05, 10))
  // La bonbonne, translucide, et l'eau dedans.
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 16), glass('#9fd8ff', 0.35), 0, 0.72, 0))
  g.add(cylinder(0.1, 0.1, 0.2, lit('#4aa8e8'), 0, 0.7, 0, 14), cylinder(0.05, 0.08, 0.05, lit('#4aa8e8'), 0, 0.575, 0, 12))
  return { solid: g, live }
}

/**
 * Retour plateaux, adossé au mur (dos à -z) : casier inox à cinq glissières (quelques plateaux
 * oubliés, pas tous finis), et au-dessus l'enseigne « RETOUR PLATEAUX ».
 */
const trayReturn: Builder = ({ random }) => {
  const g = new THREE.Group()
  const steel = lit(C.steel), dark = lit(C.steelDark)
  const W = 0.86, D = 0.38
  for (const x of [-W / 2, W / 2]) g.add(box(0.03, 0.78, D, steel, x, 0.39, 0))
  g.add(box(W, 0.03, D, steel, 0, 0.78, 0), box(W, 0.6, 0.02, dark, 0, 0.42, -D / 2 + 0.01))
  for (let i = 0; i < 5; i++) {
    const y = 0.14 + i * 0.13
    g.add(box(W - 0.04, 0.008, 0.02, steel, 0, y - 0.01, D / 2 - 0.02))
    if (random() < 0.55) {
      g.add(box(W - 0.14, 0.018, 0.28, lit(C.tray), 0, y, 0.02, 0.006))
      if (random() < 0.6) plate(g, -0.15 + random() * 0.3, y + 0.01, 0.02, random() < 0.5 ? pick(random, FOOD) : undefined)
    }
  }
  const sign = drawnTexture(384, 64, (c) => {
    c.fillStyle = '#1b1d22'
    c.fillRect(0, 0, 384, 64)
    c.font = '800 30px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = '#ffb45e'
    c.fillText(tr('RETOUR PLATEAUX', 'TRAY RETURN'), 192, 34)
  })
  g.add(mesh(new THREE.PlaneGeometry(W, 0.14), new THREE.MeshBasicMaterial({ map: sign }), 0, 0.88, -0.02))
  g.add(box(W + 0.02, 0.16, 0.02, lit(C.black), 0, 0.88, -0.035))
  return { solid: g }
}

/** Menu du jour : écran mural (dos à -z) cerclé de noir, bandeau orange Elite et quatre lignes. */
const menuBoard: Builder = () => {
  const menu = menuOf()
  const lines: [string, string][] = [
    [tr('ENTRÉE', 'STARTER'), menu.starter],
    [tr('PLAT', 'MAIN'), menu.main],
    [tr('DESSERT', 'DESSERT'), menu.dessert],
    [tr('BOISSON', 'DRINK'), menu.drink],
  ]
  const screen = drawnTexture(640, 336, (c) => {
    c.fillStyle = '#10131a'
    c.fillRect(0, 0, 640, 336)
    c.fillStyle = '#e0701e'
    c.fillRect(0, 0, 640, 58)
    c.textBaseline = 'middle'
    c.font = '800 30px system-ui, sans-serif'
    c.fillStyle = '#10131a'
    c.fillText(tr('MESS · MENU DU JOUR', 'MESS · TODAY\'S MENU'), 22, 31)
    c.textAlign = 'right'
    c.font = '700 22px system-ui, sans-serif'
    c.fillText(menuDate(), 618, 31)
    c.textAlign = 'left'
    lines.forEach(([label, dish], i) => {
      const y = 100 + i * 64
      c.font = '700 17px system-ui, sans-serif'
      c.fillStyle = '#ff9f55'
      c.fillText(label, 24, y - 14)
      c.font = '600 27px system-ui, sans-serif'
      c.fillStyle = '#eef1f6'
      c.fillText(dish, 24, y + 12, 592)
    })
    c.fillStyle = '#6d7686'
    c.font = 'italic 16px system-ui, sans-serif'
    c.textAlign = 'right'
    c.fillText(tr('Chef Marcel · réclamations au sergent Rourke', 'Chef Marcel · complaints to Sergeant Rourke'), 618, 322)
  })
  const g = new THREE.Group()
  g.add(box(1.24, 0.66, 0.03, lit(C.black), 0, 0.62, 0.015, 0.01))
  g.add(mesh(new THREE.PlaneGeometry(1.18, 0.62), new THREE.MeshBasicMaterial({ map: screen }), 0, 0.62, 0.031))
  return { solid: g }
}

// ---------------------------------------------------------------- comptoir du self

/**
 * Comptoir du self, face aux convives (+z), le chef derrière (-z). `label` : longueur (5,2 par
 * défaut). La file le longe de +x vers -x : glissière à plateaux, bain-marie (quatre bacs sous
 * leur vitre et leur buée), passe du chef sous ses lampes chauffantes, vitrine réfrigérée
 * (salades, fruits, desserts), puis pain et boissons. Côté cuisine, des piles d'assiettes.
 */
const selfCounter: Builder = ({ label, random }) => {
  const W = Number(label) >= 2 && Number(label) <= 8 ? Number(label) : 5.2
  const g = new THREE.Group()
  const steel = lit(C.steel), dark = lit(C.steelDark), black = lit(C.black), orange = lit(C.orange)
  const top = 0.45
  // Caisson, façade orange à baguettes inox, socle noir, dessus inox.
  g.add(box(W, 0.4, 0.54, dark, 0, 0.22, 0), box(W, 0.05, 0.52, black, 0, 0.025, -0.005))
  g.add(box(W - 0.02, 0.32, 0.02, orange, 0, 0.24, 0.27))
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / Math.round(W / 0.65)) g.add(box(0.025, 0.34, 0.025, steel, x, 0.24, 0.28))
  g.add(box(W + 0.04, 0.03, 0.6, steel, 0, top - 0.015, 0))
  // Glissière à plateaux sur ses consoles.
  g.add(box(W, 0.014, 0.13, steel, 0, top - 0.06, 0.37))
  for (const r of [0.33, 0.41]) g.add(barX(0.008, W, steel, 0, top - 0.045, r, 6))
  for (let x = -W / 2 + 0.2; x < W / 2; x += 0.8) g.add(box(0.02, 0.06, 0.12, dark, x, top - 0.09, 0.35))

  const sneezeGuard = (x0: number, x1: number, tint: string) => {
    const w = x1 - x0, cx = (x0 + x1) / 2
    for (const x of [x0 + 0.02, x1 - 0.02]) g.add(cylinder(0.008, 0.008, 0.26, steel, x, top + 0.13, 0.12, 6))
    g.add(barX(0.009, w, steel, cx, top + 0.26, 0.12, 6), box(w - 0.08, 0.006, 0.01, glow(tint), cx, top + 0.245, 0.1))
    const pane = part(new THREE.PlaneGeometry(w - 0.04, 0.22), glass('#cfefff', 0.18), cx, top + 0.2, 0.17)
    pane.rotation.x = -0.5
    return pane
  }
  const live = new THREE.Group()

  // Bain-marie : quatre bacs de plats chauds, cuillères de service.
  const hot0 = 0.25, hot1 = 1.85
  g.add(box(hot1 - hot0, 0.02, 0.4, black, (hot0 + hot1) / 2, top + 0.002, 0.02))
  const pans = 4, pw = (hot1 - hot0) / pans
  const hot = [FOOD[0], FOOD[1], FOOD[2], FOOD[3]].sort(() => random() - 0.5)
  for (let i = 0; i < pans; i++) {
    const x = hot0 + (i + 0.5) * pw
    g.add(box(pw - 0.04, 0.02, 0.32, lit(C.steel), x, top + 0.012, 0.02), box(pw - 0.07, 0.014, 0.28, lit(hot[i]), x, top + 0.022, 0.02))
    const ladle = barZ(0.006, 0.2, lit(C.steel), x + 0.05, top + 0.05, -0.05, 5)
    ladle.rotation.x = Math.PI / 2 - 0.5
    g.add(ladle)
  }
  live.add(sneezeGuard(hot0, hot1, '#ffb45e'))
  // Buée qui monte des bacs.
  const puffs: THREE.Mesh[] = []
  const steam = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false })
  for (let i = 0; i < 4; i++) {
    const p = part(new THREE.SphereGeometry(0.05, 8, 6), steam, hot0 + (i + 0.5) * pw, top + 0.05, 0.02)
    puffs.push(p)
    live.add(p)
  }

  // Passe du chef : étagère chauffante, lampes, assiettes prêtes.
  const passe0 = -0.7, passe1 = 0.2, pcx = (passe0 + passe1) / 2
  for (const x of [passe0 + 0.03, passe1 - 0.03]) g.add(box(0.025, 0.36, 0.025, steel, x, top + 0.18, -0.1))
  g.add(box(passe1 - passe0, 0.02, 0.3, steel, pcx, top + 0.2, -0.05), box(passe1 - passe0 - 0.1, 0.008, 0.02, glow('#ff7a2a'), pcx, top + 0.19, 0.1))
  for (const x of [pcx - 0.22, pcx + 0.22]) g.add(cylinder(0.035, 0.05, 0.06, black, x, top + 0.33, -0.05, 10), cylinder(0.04, 0.04, 0.01, glow('#ff6a1c'), x, top + 0.297, -0.05, 10))
  g.add(barX(0.008, passe1 - passe0, steel, pcx, top + 0.36, -0.1, 6))
  for (const x of [pcx - 0.25, pcx, pcx + 0.25]) if (random() < 0.7) plate(g, x, top + 0.21, -0.05, pick(random, FOOD))

  // Vitrine réfrigérée : salades, corbeille de fruits, desserts en coupelles.
  const cold0 = -1.85, cold1 = -0.75
  g.add(box(cold1 - cold0, 0.02, 0.4, lit('#2b3e4f'), (cold0 + cold1) / 2, top + 0.002, 0.02))
  for (let x = cold0 + 0.12; x < cold1 - 0.08; x += 0.16) {
    const kind = random()
    if (kind < 0.4) {
      g.add(cylinder(0.055, 0.04, 0.04, lit(C.white), x, top + 0.03, 0.06, 10), sphere(0.04, lit(pick(random, ['#6fb04a', '#8cc05a', '#e8772a'])), x, top + 0.05, 0.06, 8))
    } else if (kind < 0.75) {
      g.add(cylinder(0.03, 0.022, 0.05, glow('#eaf6ff'), x, top + 0.035, -0.02, 8), cylinder(0.028, 0.028, 0.012, lit(pick(random, ['#7a2a6b', '#f3eddc', '#5a3a24'])), x, top + 0.064, -0.02, 8))
    } else {
      for (let k = 0; k < 3; k++) g.add(sphere(0.028, lit(pick(random, ['#d8323c', '#ffd35a', '#6fb04a', '#e8772a', '#b28aff'])), x + (k - 1) * 0.04, top + 0.03, 0.08, 8))
    }
  }
  live.add(sneezeGuard(cold0, cold1, '#8ff0ff'))

  // Pain et boissons : corbeille de miches, pichets de jus, gobelets.
  const drink0 = -W / 2 + 0.05, drink1 = -1.9
  g.add(box(0.3, 0.05, 0.2, lit(C.wood), drink1 - 0.2, top + 0.025, 0.08, 0.01))
  for (let i = 0; i < 4; i++) g.add(sphere(0.045, lit('#c98a4a'), drink1 - 0.3 + i * 0.065, top + 0.06, 0.08, 8))
  for (const [i, c] of (['#ff9a2a', '#b25adf'] as const).entries()) {
    const x = drink0 + 0.12 + i * 0.16
    g.add(box(0.12, 0.04, 0.14, lit(C.steelDark), x, top + 0.02, -0.06), cylinder(0.045, 0.045, 0.14, lit(c), x, top + 0.11, -0.06, 10))
    live.add(part(new THREE.CylinderGeometry(0.052, 0.052, 0.18, 12), glass('#ffffff', 0.25), x, top + 0.13, -0.06))
  }
  for (let i = 0; i < 4; i++) g.add(cylinder(0.022, 0.018, 0.05, lit('#c9dde6'), drink0 + 0.1 + i * 0.05, top + 0.025, 0.12, 8))

  // Côté cuisine : étagère basse chargée de piles d'assiettes.
  g.add(box(W - 0.2, 0.015, 0.2, steel, 0, 0.2, -0.24))
  for (let x = -W / 2 + 0.3; x < W / 2 - 0.2; x += 0.45) {
    const n = 3 + Math.floor(random() * 5)
    for (let k = 0; k < n; k++) g.add(cylinder(0.06, 0.05, 0.012, lit(C.plate), x, 0.215 + k * 0.014, -0.25, 12))
  }

  return {
    solid: g,
    live,
    update(t) {
      puffs.forEach((p, i) => {
        const k = (t * 0.35 + i * 0.27) % 1
        p.position.y = top + 0.05 + k * 0.28
        p.scale.setScalar(0.6 + k * 1.4)
        p.visible = k < 0.85
      })
    },
  }
}

/** Pile de plateaux au début du self, bacs à couverts et à serviettes (posée sur le comptoir). */
const trayStack: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.5, 0.02, 0.4, lit(C.steelDark), 0, 0.01, 0))
  for (let i = 0; i < 9; i++) g.add(box(0.36, 0.016, 0.27, lit(i % 3 ? C.tray : C.orange), 0.04, 0.03 + i * 0.018, 0.02, 0.006))
  for (const [k, c] of ['#c6ccd4', '#c6ccd4', '#c6ccd4', '#f4f6f8'].entries()) {
    const z = -0.14 + k * 0.095
    g.add(box(0.08, 0.05, 0.085, lit(C.steel), -0.19, 0.035, z))
    for (let j = 0; j < 4; j++) g.add(box(0.008, 0.06, 0.008, lit(c), -0.21 + j * 0.013, 0.08, z))
  }
  return { solid: g }
}

/**
 * Rail à bons de commande de la passe (posé sur le comptoir) : imprimante à tickets, deux
 * montants, et les bons qui pendent, dont un encore chaud, orange.
 */
const orderRail: Builder = ({ random }) => {
  const g = new THREE.Group()
  const steel = lit(C.steel)
  g.add(box(0.14, 0.08, 0.11, lit(C.black), 0.26, 0.04, 0.02, 0.01), box(0.1, 0.006, 0.02, glow('#7dffa8'), 0.26, 0.082, 0.07))
  for (const x of [-0.34, 0.34]) g.add(cylinder(0.008, 0.008, 0.46, steel, x, 0.23, -0.08, 6))
  g.add(barX(0.01, 0.72, steel, 0, 0.45, -0.08, 6))
  const n = 3 + Math.floor(random() * 3)
  for (let i = 0; i < n; i++) {
    const ticket = box(0.075, 0.11, 0.004, lit(i === 1 ? '#ffc38a' : '#f7f3e8'), -0.26 + i * 0.12, 0.385, -0.075)
    ticket.rotation.z = (random() - 0.5) * 0.2
    g.add(ticket)
  }
  return { solid: g }
}

// ---------------------------------------------------------------- cuisine

/**
 * Frigo double porte, adossé au mur (dos à -z) : inox, poignées, afficheur de température, grille
 * d'aération, et un mot aimanté sur la porte (la ration du sergent, qui disparaît quand même).
 */
const kitchenFridge: Builder = () => {
  const g = new THREE.Group()
  const W = 0.9, D = 0.55, H = 0.95
  g.add(box(W, H, D, lit(C.steelMid), 0, H / 2, 0, 0.015))
  for (const x of [-W / 4, W / 4]) {
    g.add(box(W / 2 - 0.02, H - 0.1, 0.02, lit(C.steel), x, H / 2 + 0.02, D / 2 + 0.005))
    g.add(cylinder(0.01, 0.01, 0.4, lit(C.black), x > 0 ? x - W / 4 + 0.05 : x + W / 4 - 0.05, 0.62, D / 2 + 0.04, 6))
  }
  g.add(box(W, 0.05, D - 0.02, lit(C.black), 0, 0.025, 0), box(0.12, 0.04, 0.01, glow('#8ff0ff'), W / 4, H - 0.12, D / 2 + 0.02))
  const note = drawnTexture(128, 128, (c) => {
    c.fillStyle = '#fff7c9'
    c.fillRect(0, 0, 128, 128)
    c.fillStyle = '#c8321e'
    c.font = '800 20px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText(tr('RATION', 'RATION'), 64, 36)
    c.fillText(tr('SERGENT', 'SERGEANT'), 64, 62)
    c.font = '700 14px system-ui, sans-serif'
    c.fillStyle = '#333'
    c.fillText(tr('NE PAS TOUCHER', 'DO NOT TOUCH'), 64, 96)
  })
  const paper = mesh(new THREE.PlaneGeometry(0.13, 0.13), new THREE.MeshLambertMaterial({ map: note }), -W / 4, 0.68, D / 2 + 0.017)
  paper.rotation.z = 0.08
  g.add(paper, sphere(0.012, lit('#d8323c'), -W / 4, 0.74, D / 2 + 0.02, 6))
  return { solid: g }
}

/**
 * Plan de travail (dos à -z) : tiroirs, planche à découper avec carottes et légume violet
 * d'une autre planète, couteau, saladier ; sur la crédence, la barre aimantée aux couteaux, les
 * louches, l'étagère à épices.
 */
const kitchenPrep: Builder = ({ random }) => {
  const W = 1.3, D = 0.55
  const g = new THREE.Group()
  carcass(g, W, D)
  for (const x of [-W / 3, 0, W / 3]) g.add(box(W / 3 - 0.03, 0.14, 0.01, lit(C.steel), x, 0.34, D / 2 - 0.005), box(0.1, 0.012, 0.012, lit(C.black), x, 0.36, D / 2 + 0.005))
  const top = 0.46
  g.add(box(0.46, 0.025, 0.3, lit(C.wood), -0.15, top + 0.012, 0.03, 0.006))
  for (let i = 0; i < 4; i++) {
    const carrot = cylinder(0.012, 0.004, 0.13, lit('#e8772a'), -0.3 + i * 0.05, top + 0.035, 0.08 - i * 0.02, 6)
    carrot.rotation.z = Math.PI / 2
    carrot.rotation.y = (random() - 0.5) * 0.6
    g.add(carrot)
  }
  g.add(sphere(0.045, lit('#7a2a6b'), -0.02, top + 0.06, -0.03, 8))
  for (let i = 0; i < 6; i++) g.add(box(0.018, 0.012, 0.018, lit(i % 2 ? '#e8772a' : '#7a2a6b'), 0.02 + random() * 0.06, top + 0.03, 0.05 + random() * 0.05))
  g.add(box(0.16, 0.004, 0.035, lit(C.steel), 0.02, top + 0.028, 0.12), box(0.07, 0.014, 0.022, lit(C.black), -0.09, top + 0.03, 0.12))
  g.add(cylinder(0.1, 0.06, 0.07, lit(C.white), 0.38, top + 0.035, 0.02, 14), cylinder(0.085, 0.085, 0.01, lit('#6fb04a'), 0.38, top + 0.06, 0.02, 12))
  splashback(g, W, D)
  // Barre aimantée : quatre couteaux, lames vers le bas.
  g.add(box(0.5, 0.025, 0.015, lit(C.black), -0.25, 0.8, -D / 2 + 0.015))
  for (let i = 0; i < 4; i++) g.add(box(0.025, 0.12, 0.006, lit(C.steel), -0.43 + i * 0.12, 0.72, -D / 2 + 0.028), box(0.022, 0.05, 0.012, lit(C.black), -0.43 + i * 0.12, 0.8, -D / 2 + 0.03))
  // Épices sur leur étagère.
  g.add(box(0.5, 0.015, 0.08, lit(C.steel), 0.33, 0.7, -D / 2 + 0.05))
  for (let i = 0; i < 6; i++) g.add(cylinder(0.018, 0.018, 0.06, lit(pick(random, ['#c8321e', '#d9a441', '#6fb04a', '#8a4a24', '#f3eddc'])), 0.13 + i * 0.075, 0.738, -D / 2 + 0.05, 8))
  return { solid: g }
}

/**
 * Fourneau sous sa hotte (dos à -z) : four vitré, rangée de boutons, plaque noire à quatre feux,
 * grande marmite qui fume, sauteuse et casserole. La hotte ronronne.
 */
const kitchenRange: Builder = () => {
  const W = 1.4, D = 0.55
  const g = new THREE.Group()
  const top = 0.46
  g.add(box(W, 0.43, D - 0.02, lit(C.steelDark), 0, 0.235, -0.01), box(W - 0.02, 0.05, D - 0.06, lit(C.black), 0, 0.025, -0.02))
  // Four : porte vitrée, lueur de la cuisson, poignée.
  g.add(box(0.7, 0.26, 0.02, lit(C.steel), 0, 0.2, D / 2 - 0.005), box(0.54, 0.14, 0.012, glow('#ff9a4a'), 0, 0.19, D / 2 + 0.006))
  g.add(barX(0.01, 0.56, lit(C.black), 0, 0.31, D / 2 + 0.03, 6))
  for (let i = 0; i < 6; i++) g.add(cylinder(0.018, 0.018, 0.02, lit(C.black), -0.5 + i * 0.2, 0.39, D / 2 + 0.005, 10).rotateX(Math.PI / 2))
  g.add(box(W + 0.02, 0.03, D, lit(C.black), 0, top - 0.015, 0))
  const burners: [number, number][] = [[-0.35, -0.12], [0.3, -0.12], [-0.35, 0.12], [0.3, 0.12]]
  for (const [x, z] of burners) {
    const ring = mesh(new THREE.TorusGeometry(0.075, 0.008, 5, 20), glow('#ff5a1c'), x, top + 0.004, z)
    ring.rotation.x = Math.PI / 2
    g.add(ring)
  }
  // Marmite (arrière gauche), sauteuse (avant gauche), casserole (arrière droit) ; l'avant droit reste libre.
  g.add(cylinder(0.13, 0.12, 0.2, lit(C.steel), -0.35, top + 0.1, -0.12, 16), cylinder(0.125, 0.125, 0.01, lit('#9a4a24'), -0.35, top + 0.19, -0.12, 14))
  for (const s of [-1, 1]) g.add(box(0.04, 0.02, 0.02, lit(C.steelDark), -0.35 + s * 0.14, top + 0.16, -0.12))
  g.add(cylinder(0.1, 0.09, 0.03, lit(C.black), -0.35, top + 0.02, 0.12, 14), cylinder(0.08, 0.08, 0.008, lit('#d9861e'), -0.35, top + 0.033, 0.12, 12))
  g.add(barZ(0.01, 0.18, lit(C.black), -0.35, top + 0.03, 0.3, 6))
  g.add(cylinder(0.07, 0.065, 0.1, lit(C.steel), 0.3, top + 0.05, -0.12, 14), barX(0.01, 0.14, lit(C.black), 0.44, top + 0.08, -0.12, 6))
  splashback(g, W, D, top, 0.84)
  // Hotte, feux de travail dessous, gaine vers le plafond.
  g.add(box(W, 0.1, 0.46, lit(C.steel), 0, 0.9, -0.04), box(W - 0.3, 0.04, 0.3, lit(C.steelMid), 0, 0.965, -0.1))
  g.add(box(W - 0.1, 0.008, 0.03, glow('#fff1d6'), 0, 0.848, 0.12))
  g.add(box(W - 0.04, 0.02, 0.02, lit(C.orange), 0, 0.93, 0.19))

  // La vapeur de la marmite.
  const live = new THREE.Group()
  const steam = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false })
  const puffs = [0, 1, 2].map(() => {
    const p = part(new THREE.SphereGeometry(0.045, 8, 6), steam, -0.35, top + 0.22, -0.12)
    live.add(p)
    return p
  })
  return {
    solid: g,
    live,
    emitter: 'hum',
    update(t) {
      puffs.forEach((p, i) => {
        const k = (t * 0.45 + i / 3) % 1
        p.position.set(-0.35 + Math.sin(t * 1.3 + i) * 0.03, top + 0.22 + k * 0.4, -0.12 + k * 0.05)
        p.scale.setScalar(0.7 + k * 1.6)
        p.visible = k < 0.9
      })
    },
  }
}

/**
 * Plonge (dos à -z) : double bac, mitigeur col de cygne, égouttoir chargé d'assiettes, éponge,
 * et une casserole qui trempe.
 */
const kitchenSink: Builder = ({ random }) => {
  const W = 1.1, D = 0.55
  const g = new THREE.Group()
  carcass(g, W, D)
  g.add(box(0.2, 0.3, 0.01, lit(C.steel), -0.2, 0.25, D / 2 - 0.005), box(0.2, 0.3, 0.01, lit(C.steel), 0.02, 0.25, D / 2 - 0.005))
  const top = 0.46
  for (const x of [-0.3, 0.02]) g.add(box(0.28, 0.02, 0.34, lit('#2c3138'), x, top - 0.005, 0.02), box(0.26, 0.004, 0.3, lit('#7fb8d8'), x, top - 0.012, 0.02))
  g.add(cylinder(0.012, 0.015, 0.22, lit(C.steel), -0.14, top + 0.11, -0.2, 8))
  const neck = mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 12, Math.PI), lit(C.steel), -0.14, top + 0.22, -0.13)
  neck.rotation.y = Math.PI / 2
  g.add(neck)
  g.add(cylinder(0.08, 0.07, 0.08, lit(C.steelDark), 0.05, top - 0.01, 0.04, 12))
  // Égouttoir.
  g.add(box(0.3, 0.02, 0.3, lit(C.steel), 0.36, top + 0.01, 0.02))
  for (let i = 0; i < 5; i++) {
    const p = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12), lit(C.plate), 0.26 + i * 0.05, top + 0.08, 0.02)
    p.rotation.z = Math.PI / 2 + (random() - 0.5) * 0.1
    g.add(p)
  }
  g.add(box(0.06, 0.025, 0.04, lit('#ffd35a'), -0.46, top + 0.012, 0.15), box(0.06, 0.008, 0.04, lit('#39a85a'), -0.46, top + 0.028, 0.15))
  splashback(g, W, D)
  g.add(box(W - 0.1, 0.015, 0.1, lit(C.steel), 0, 0.72, -D / 2 + 0.06))
  for (let i = 0; i < 6; i++) g.add(cylinder(0.022, 0.018, 0.05, lit('#c9dde6'), -0.4 + i * 0.16, 0.753, -D / 2 + 0.06, 8))
  return { solid: g }
}

/**
 * Garde-manger (dos à -z) : rayonnages inox chargés de sacs (farine, protéines, riz de Jaroua),
 * de bocaux, de conserves, d'une cagette de fruits et des bidons orange du ravitaillement.
 */
const kitchenPantry: Builder = ({ random }) => {
  const W = 1.2, D = 0.42, H = 0.95
  const g = new THREE.Group()
  const steel = lit(C.steel)
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) for (const z of [-D / 2 + 0.02, D / 2 - 0.02]) g.add(box(0.03, H, 0.03, steel, x, H / 2, z))
  const shelves = [0.06, 0.38, 0.7, 0.94]
  for (const y of shelves) g.add(box(W, 0.02, D, steel, 0, y, 0))
  g.add(box(W, H - 0.1, 0.01, lit(C.steelDark), 0, H / 2, -D / 2 + 0.005))
  // En bas : sacs de farine et de protéines.
  for (let x = -W / 2 + 0.15; x < W / 2 - 0.1; x += 0.24) {
    const c = pick(random, ['#e8dcc0', '#d9c9a3', '#c9b58a'])
    g.add(box(0.2, 0.24, 0.26, lit(c), x, 0.19, 0.02, 0.05), box(0.21, 0.04, 0.27, lit(pick(random, [C.orange, '#2f7de0', '#39a85a'])), x, 0.2, 0.02, 0.01))
  }
  // Au milieu : bocaux et conserves.
  for (let x = -W / 2 + 0.08; x < W / 2 - 0.06; x += 0.09) {
    if (random() < 0.5) g.add(cylinder(0.035, 0.035, 0.12, lit(pick(random, FOOD)), x, 0.45, 0.04, 10), cylinder(0.037, 0.037, 0.02, lit(C.steelDark), x, 0.52, 0.04, 10))
    else g.add(cylinder(0.03, 0.03, 0.08, lit(C.steel), x, 0.43, 0.06, 10), cylinder(0.031, 0.031, 0.05, lit(pick(random, ['#d8323c', '#ffd35a', '#39a85a', '#2f7de0'])), x, 0.43, 0.06, 10))
  }
  // En haut : cagette de fruits et bidons du ravitaillement.
  g.add(box(0.36, 0.1, 0.26, lit(C.wood), -0.3, 0.76, 0.03))
  for (let i = 0; i < 8; i++) g.add(sphere(0.035, lit(pick(random, ['#d8323c', '#ffd35a', '#6fb04a', '#e8772a'])), -0.42 + (i % 4) * 0.08, 0.83, -0.02 + Math.floor(i / 4) * 0.1, 8))
  for (let i = 0; i < 3; i++) g.add(box(0.14, 0.2, 0.14, lit(C.orange), 0.1 + i * 0.17, 0.81, 0.03, 0.02), box(0.06, 0.03, 0.06, lit(C.black), 0.1 + i * 0.17, 0.925, 0.03))
  return { solid: g }
}

export const KITCHEN = {
  'canteen-table': canteenTable,
  'water-fountain': waterFountain,
  'tray-return': trayReturn,
  'menu-board': menuBoard,
  'self-counter': selfCounter,
  'tray-stack': trayStack,
  'order-rail': orderRail,
  'kitchen-fridge': kitchenFridge,
  'kitchen-prep': kitchenPrep,
  'kitchen-range': kitchenRange,
  'kitchen-sink': kitchenSink,
  'kitchen-pantry': kitchenPantry,
} satisfies Record<string, Builder>
