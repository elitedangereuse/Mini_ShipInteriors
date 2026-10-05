import * as THREE from 'three'
import { animatedScreen, box, cylinder, decal, drawnTexture, glass, glow, keepShared, lit, mesh, part, pointCloud, sphere, type Builder } from './kit'
import { tr } from '../i18n'

/*
 * Le sanctuaire de la Voie, caché dans la cale derrière la salle des machines, d'après les trois
 * aventures de la Voie (L'Épreuve, La Cérémonie, Les Reliques) : on y entre en adepte. Tout y
 * tranche avec la cale : pas d'acier ni d'orange, mais de l'obsidienne, de l'or terni et le vert
 * de Raxxla ; des flammes pâles, des tentures, et au mur ouest le portail vers Raxxla, qui
 * aspire la lumière. Autour : les Chroniques de la Voie sur leur lutrin, l'icône de Salomé, le
 * terminal adepte@voie, les trois Reliques, les robes des adeptes, la roue brisée du Dark Wheel,
 * et l'Adepte Supérieur, qui veille sous sa capuche.
 * Un objet accroché est construit dos au mur (origine sur la face du mur, contenu vers +z).
 */

const C = {
  obsidian: '#0b0e0e',
  stone: '#161b1b',
  stoneLight: '#232a29',
  gold: '#c9a24a',
  goldDark: '#7a6230',
  raxxla: '#0f7a5a',
  raxxlaDark: '#0a3a2c',
  ember: '#5dffc4',
  pale: '#c8ffe6',
  violet: '#8a5cff',
  void: '#030406',
  velvet: '#12241e',
  velvetDark: '#0d1c17',
  robe: '#2a453b',
  parchment: '#d8c9a0',
  ink: '#2a2014',
  blood: '#7a1a1a',
  iron: '#2a2d30',
  wax: '#1a1d1c',
  skin: '#c89a7a',
}

/** Rayon et angle des sommets d'un pétale de l'emblème, pointe vers +x, en fractions du rayon extérieur. */
const PETAL: [number, number][] = [
  [0.52, -0.2],
  [0.8, -0.36],
  [1, 0],
  [0.8, 0.36],
  [0.52, 0.2],
]

/** Contour d'un pétale d'angle `a` (radians), centré en (x, y), de rayon extérieur `r`. */
function petalPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
  const cos = Math.cos(a), sin = Math.sin(a)
  c.beginPath()
  for (const [u, v] of PETAL) c.lineTo(x + (u * cos - v * sin) * r, y + (u * sin + v * cos) * r)
  c.closePath()
}

/** Hexagone à côtés plats en haut et en bas (sommets à gauche et à droite), comme celui de l'emblème. */
function flatHexagon(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath()
  for (let i = 0; i < 6; i++) c.lineTo(x + Math.cos((i / 6) * Math.PI * 2) * r, y + Math.sin((i / 6) * Math.PI * 2) * r)
  c.closePath()
}

/**
 * L'emblème de la Voie (le symbole de Raxxla) : six pétales autour d'un hexagone en pointillés,
 * un cercle, un point, et trois arcs brisés. `ink` pour les pétales, `line` pour le tracé.
 */
function drawEmblem(c: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, line: string) {
  c.fillStyle = ink
  for (let i = 0; i < 6; i++) {
    petalPath(c, x, y, r, (i / 6) * Math.PI * 2)
    c.fill()
  }
  c.strokeStyle = line
  c.lineWidth = Math.max(2, r * 0.035)
  c.setLineDash([r * 0.07, r * 0.045])
  flatHexagon(c, x, y, r * 0.42)
  c.stroke()
  c.setLineDash([])
  c.beginPath()
  c.arc(x, y, r * 0.2, 0, Math.PI * 2)
  c.stroke()
  for (const a of [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]) {
    c.beginPath()
    c.arc(x, y, r * 0.29, a - 0.45, a + 0.45)
    c.stroke()
  }
  c.fillStyle = line
  c.beginPath()
  c.arc(x, y, r * 0.045, 0, Math.PI * 2)
  c.fill()
}

/** Texte écrit le long d'un cercle (sens horaire, lettres tournées vers le centre). */
function ringText(c: CanvasRenderingContext2D, text: string, x: number, y: number, r: number, start = -Math.PI / 2) {
  const step = (Math.PI * 2) / text.length
  for (let i = 0; i < text.length; i++) {
    const a = start + i * step
    c.save()
    c.translate(x + Math.cos(a) * r, y + Math.sin(a) * r)
    c.rotate(a + Math.PI / 2)
    c.fillText(text[i], 0, 0)
    c.restore()
  }
}

/** Flamme d'une bougie : un cône clair, qui vacille (cf. `flicker`). */
function flame(color: string, x: number, y: number, z: number, size = 1): THREE.Mesh {
  const f = part(new THREE.ConeGeometry(0.01 * size, 0.034 * size, 6), glow(color), x, y + 0.017 * size, z)
  return f
}

/** Fait vaciller des flammes (échelle verticale), chacune à sa phase. */
function flicker(flames: { f: THREE.Object3D; phase: number }[], t: number) {
  for (const { f, phase } of flames) {
    const s = 0.8 + 0.22 * Math.sin(t * 9 + phase) + 0.12 * Math.sin(t * 23 + phase * 2)
    f.scale.set(1, s, 1)
  }
}

// ---------------------------------------------------------------- le sol

/** Bouquets de bougies du sol, autour du centre : cinq sommets de l'hexagone (le sixième, à l'ouest, est le lutrin). */
const CANDLES: [number, number][] = [0, 1, 2, 4, 5].map((i) => {
  const a = (i / 6) * Math.PI * 2
  return [Math.round(Math.cos(a) * 1.32 * 100) / 100, Math.round(Math.sin(a) * 1.32 * 100) / 100]
})

/**
 * Dallage d'obsidienne de tout le sanctuaire (4,7 × 4,7, centré sur la pièce), joints d'or terni ;
 * au centre, l'emblème incrusté, cerclé de sa devise en lettres « brouillées » comme sur le site.
 * Par-dessus, les pétales s'éveillent l'un après l'autre, et cinq bouquets de bougies noires aux
 * flammes pâles marquent les sommets de l'hexagone (le sixième est le lutrin, vers le portail).
 */
const voieFloor: Builder = ({ random }) => {
  const g = new THREE.Group()
  const S = 4.7, PX = 1024, K = PX / S
  const R = 1.1
  const map = drawnTexture(PX, PX, (c) => {
    c.fillStyle = C.obsidian
    c.fillRect(0, 0, PX, PX)
    // Grandes dalles, chacune de sa nuance, veinées.
    const n = 6, tile = PX / n
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const l = 5 + Math.floor(random() * 5)
        c.fillStyle = `hsl(165, 12%, ${l}%)`
        c.fillRect(i * tile + 2, j * tile + 2, tile - 4, tile - 4)
        c.strokeStyle = 'rgba(120, 160, 150, 0.08)'
        c.lineWidth = 1
        c.beginPath()
        let vx = i * tile + random() * tile, vy = j * tile
        c.moveTo(vx, vy)
        for (let k = 0; k < 5; k++) c.lineTo((vx += (random() - 0.5) * 50), (vy += tile / 5))
        c.stroke()
      }
    }
    c.strokeStyle = 'rgba(201, 162, 74, 0.35)'
    c.lineWidth = 2
    for (let i = 1; i < n; i++) {
      c.beginPath()
      c.moveTo(i * tile, 0)
      c.lineTo(i * tile, PX)
      c.moveTo(0, i * tile)
      c.lineTo(PX, i * tile)
      c.stroke()
    }
    // Le cercle de l'emblème, sur fond vert de Raxxla.
    const cx = PX / 2, cy = PX / 2, r = R * K
    c.fillStyle = C.obsidian
    c.beginPath()
    c.arc(cx, cy, r * 1.34, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = C.gold
    c.lineWidth = 4
    for (const k of [1.34, 1.13]) {
      c.beginPath()
      c.arc(cx, cy, r * k, 0, Math.PI * 2)
      c.stroke()
    }
    c.fillStyle = C.raxxlaDark
    c.beginPath()
    c.arc(cx, cy, r * 1.08, 0, Math.PI * 2)
    c.fill()
    drawEmblem(c, cx, cy, r, '#040605', C.gold)
    // La devise, entre les deux cercles d'or.
    c.fillStyle = C.gold
    c.font = '600 20px Georgia, "Times New Roman", serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    ringText(c, tr('รUiş ℓＡ ѶσiＥ ✦ Ｅt яＥנσiŇş tＥş ⓕяèяＥş Ｅt şσＥUяş ✦ ', 'ⓕσℓℓσⓌ thＥ ᵖＡth ✦ ＡŇd ｊσiŇ yσUя bяσthＥяş ＡŇd şişTＥяş ✦ '), cx, cy, r * 1.235)
    // Coulures de cire au pied des bougies.
    c.fillStyle = 'rgba(30, 36, 34, 0.9)'
    for (const [bx, bz] of CANDLES) {
      c.beginPath()
      c.ellipse(cx + bx * K, cy + bz * K, 16 + random() * 8, 12 + random() * 6, random() * 3, 0, Math.PI * 2)
      c.fill()
    }
  })
  g.add(decal(map, S, S, 0.004))
  const live = new THREE.Group()
  // Les pétales qui s'éveillent : un halo vert par pétale, qui fait le tour de l'emblème.
  const petals = Array.from({ length: 6 }, (_, i) => {
    const tex = keepShared(drawnTexture(256, 256, (c) => {
      c.shadowColor = C.ember
      c.shadowBlur = 18
      c.fillStyle = 'rgba(93, 255, 196, 0.85)'
      petalPath(c, 128, 128, 120, (i / 6) * Math.PI * 2)
      c.fill()
    }))
    // Décalé plus fort que le dallage (cf. decal) : sinon il passe dessous.
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 })
    const p = part(new THREE.PlaneGeometry(R * 2.14, R * 2.14), m, 0, 0.008, 0)
    p.rotation.x = -Math.PI / 2
    live.add(p)
    return m
  })
  // Les bougies noires, flammes pâles.
  const flames: { f: THREE.Object3D; phase: number }[] = []
  for (const [bx, bz] of CANDLES) {
    const spots: [number, number, number][] = [[-0.04, 0.16, 0.01], [0.035, 0.22, -0.02], [0.01, 0.11, 0.045], [-0.03, 0.08, -0.04]]
    g.add(cylinder(0.09, 0.1, 0.012, lit(C.goldDark, 'metal'), bx, 0.006, bz, 16))
    for (const [x, h, z] of spots) {
      g.add(cylinder(0.021, 0.024, h, lit(C.wax), bx + x, 0.012 + h / 2, bz + z, 10))
      const f = flame(C.pale, bx + x, 0.012 + h, bz + z, 1.4)
      live.add(f)
      flames.push({ f, phase: random() * 6 })
    }
  }
  return {
    solid: g,
    live,
    update(t) {
      // Un pétale après l'autre, dans le sens des aiguilles d'une montre, un tour toutes les 9 s.
      petals.forEach((m, i) => {
        const k = (((t / 9) - i / 6) % 1 + 1) % 1
        m.opacity = 0.08 + 0.55 * Math.max(0, 1 - k * 4) ** 2
      })
      flicker(flames, t)
    },
  }
}

// ---------------------------------------------------------------- les murs

/**
 * Tenture de velours vert-noir, du sol au haut du mur, sur une tringle dorée ; en bas, une bande
 * brodée de runes d'or. Largeur : `label` en mètres (1 par défaut).
 */
const voieDrape: Builder = ({ label, random }) => {
  const g = new THREE.Group()
  const w = Math.min(4, Math.max(0.3, Number(label) || 1))
  const folds = Math.max(3, Math.round(w / 0.09))
  const fw = w / folds
  for (let i = 0; i < folds; i++) {
    const x = -w / 2 + fw * (i + 0.5)
    const deep = i % 2 === 0
    g.add(box(fw * 1.02, 0.9, deep ? 0.03 : 0.05, lit(deep ? C.velvetDark : C.velvet), x, 0.47, deep ? 0.02 : 0.03))
  }
  g.add(cylinder(0.012, 0.012, w + 0.06, lit(C.gold, 'metal'), 0, 0.95, 0.04, 8).rotateZ(Math.PI / 2))
  for (const x of [-w / 2 - 0.03, w / 2 + 0.03]) g.add(sphere(0.02, lit(C.gold, 'metal'), x, 0.95, 0.04, 8))
  const runes = drawnTexture(512, 32, (c) => {
    c.fillStyle = C.velvetDark
    c.fillRect(0, 0, 512, 32)
    c.fillStyle = C.gold
    c.fillRect(0, 2, 512, 2)
    c.fillRect(0, 28, 512, 2)
    c.font = '18px Georgia, serif'
    c.textBaseline = 'middle'
    const glyphs = 'ᚱᚨᚷᛉᛚᚨ✦ᛟᚹᛁᛖ✦ᚦᛏᛋ'
    for (let x = 6; x < 512; x += 22) c.fillText(glyphs[Math.floor(random() * glyphs.length)], x, 17)
  })
  runes.wrapS = THREE.RepeatWrapping
  runes.repeat.x = w / 1.2
  g.add(part(new THREE.PlaneGeometry(w, 0.05), new THREE.MeshLambertMaterial({ map: runes }), 0, 0.1, 0.056))
  return { solid: g }
}

/**
 * Portail de Raxxla, adossé au mur : l'emblème taillé dans la pierre noire, ses six pétales
 * cerclés d'or autour d'une ouverture hexagonale ; dedans, un vortex qui aspire les étoiles.
 * Devant, deux marches. 1,1 de large, 0,95 de haut.
 */
const raxxlaGate: Builder = ({ random }) => {
  const g = new THREE.Group()
  const R = 0.47, Y = 0.5, D = 0.09
  const stone = lit(C.stone), gold = lit(C.gold, 'metal')
  // Les pétales : l'emblème en relief.
  const shape = new THREE.Shape()
  PETAL.forEach(([u, v], i) => (i ? shape.lineTo(u * R, v * R) : shape.moveTo(u * R, v * R)))
  shape.closePath()
  const petalGeo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 })
  // Sur la face avant, un filet d'or : le pétale entier en or, et par-dessus sa face de pierre, un
  // peu plus petite.
  const cx = 0.76 * R
  const inset = (k: number) => {
    const sh = new THREE.Shape()
    PETAL.forEach(([u, v], j) => {
      const px = cx + (u * R - cx) * k, py = v * R * k
      j ? sh.lineTo(px, py) : sh.moveTo(px, py)
    })
    return new THREE.ShapeGeometry(sh)
  }
  const trimGeo = inset(1), faceGeo = inset(0.9)
  const front = 0.01 + D + 0.011
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const p = mesh(petalGeo, stone, 0, Y, 0.01)
    const trim = mesh(trimGeo, gold, 0, Y, front)
    const f = mesh(faceGeo, lit(C.stoneLight), 0, Y, front + 0.002)
    for (const m of [p, trim, f]) m.rotation.z = a
    g.add(p, trim, f)
  }
  // L'ouverture : un cadre hexagonal d'or, et le fond du puits, noir.
  const frame = mesh(new THREE.TorusGeometry(R * 0.44, 0.018, 4, 6), gold, 0, Y, 0.06)
  g.add(frame)
  g.add(part(new THREE.CircleGeometry(R * 0.44, 6), new THREE.MeshBasicMaterial({ color: C.void }), 0, Y, 0.012))
  // Les marches, et le socle sous les pétales du bas.
  g.add(box(1.05, 0.05, 0.36, stone, 0, 0.025, 0.2, 0.01), box(0.8, 0.05, 0.2, lit(C.stoneLight), 0, 0.075, 0.12, 0.01))
  g.add(box(1.07, 0.008, 0.008, gold, 0, 0.05, 0.38), box(0.82, 0.008, 0.008, gold, 0, 0.1, 0.22))
  // Inscription au-dessus du portail.
  const plate = drawnTexture(256, 32, (c) => {
    c.fillStyle = C.void
    c.fillRect(0, 0, 256, 32)
    c.fillStyle = C.gold
    c.font = '700 17px Georgia, serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(tr('SUIS LA VOIE DE RAXXLA', 'FOLLOW THE PATH OF RAXXLA'), 128, 17)
  })
  g.add(part(new THREE.PlaneGeometry(0.34, 0.042), new THREE.MeshBasicMaterial({ map: plate }), 0, Y + R * 0.62, 0.06))

  const live = new THREE.Group()
  // Le vortex : deux spirales qui tournent en sens contraire au fond du puits.
  const spiral = (arms: number, color: string, tight: number) =>
    drawnTexture(256, 256, (c) => {
      c.translate(128, 128)
      for (let a = 0; a < arms; a++) {
        for (let i = 0; i < 180; i++) {
          const k = i / 180
          const ang = (a / arms) * Math.PI * 2 + k * tight
          const rr = 6 + k * 122
          c.fillStyle = color
          c.globalAlpha = (1 - k) * 0.55
          c.beginPath()
          c.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, 2 + (1 - k) * 9, 0, Math.PI * 2)
          c.fill()
        }
      }
      const core = c.createRadialGradient(0, 0, 0, 0, 0, 40)
      core.addColorStop(0, 'rgba(255,255,255,0.9)')
      core.addColorStop(0.3, 'rgba(160,255,220,0.4)')
      core.addColorStop(1, 'rgba(0,0,0,0)')
      c.globalAlpha = 1
      c.fillStyle = core
      c.fillRect(-128, -128, 256, 256)
    })
  const layers = [
    { tex: spiral(3, C.ember, 5.5), speed: 0.55 },
    { tex: spiral(4, C.violet, -4), speed: -0.32 },
  ].map(({ tex, speed }, i) => {
    tex.center.set(0.5, 0.5)
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    live.add(part(new THREE.CircleGeometry(R * 0.43, 6), m, 0, Y, 0.02 + i * 0.004))
    return { tex, speed }
  })
  // Des étoiles aspirées vers le centre, en spirale.
  const N = 48
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N)
  const stars = Array.from({ length: N }, (_, i) => {
    const c = new THREE.Color(random() < 0.3 ? C.violet : random() < 0.5 ? C.pale : '#ffffff')
    col.set([c.r, c.g, c.b], i * 3)
    size[i] = 0.008 + random() * 0.01
    return { a: random() * Math.PI * 2, k: random(), speed: 0.12 + random() * 0.1 }
  })
  const cloud = pointCloud(pos, col, size)
  live.add(cloud)
  const posAttr = cloud.geometry.attributes.position as THREE.BufferAttribute
  // Trois éclats d'obsidienne qui gravitent lentement autour du portail.
  const shards = [0, 1, 2].map((i) => {
    const s = mesh(new THREE.OctahedronGeometry(0.025, 0), lit(C.obsidian))
    s.scale.set(0.7, 1.6, 0.7)
    live.add(s)
    return { s, phase: (i / 3) * Math.PI * 2 }
  })
  // Le halo vert que le portail jette au sol, devant les marches.
  const haloTex = keepShared(drawnTexture(128, 128, (c) => {
    const grad = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(93,255,196,0.55)')
    grad.addColorStop(1, 'rgba(93,255,196,0)')
    c.fillStyle = grad
    c.fillRect(0, 0, 128, 128)
  }))
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const halo = part(new THREE.PlaneGeometry(1.3, 0.9), haloMat, 0, 0.105, 0.42)
  halo.rotation.x = -Math.PI / 2
  live.add(halo)
  return {
    solid: g,
    live,
    emitter: 'hum',
    update(t) {
      for (const l of layers) l.tex.rotation = t * l.speed
      stars.forEach((s, i) => {
        const k = (s.k + t * s.speed) % 1
        const r = (1 - k) * R * 0.42
        const a = s.a + k * 5
        posAttr.setXYZ(i, Math.cos(a) * r, Y + Math.sin(a) * r, 0.03 + (1 - k) * 0.02)
      })
      posAttr.needsUpdate = true
      for (const { s, phase } of shards) {
        const a = t * 0.25 + phase
        s.position.set(Math.cos(a) * R * 1.12, Y + Math.sin(a) * R * 1.05, 0.12 + Math.sin(t * 0.7 + phase) * 0.03)
        s.rotation.set(t * 0.4 + phase, t * 0.6, 0)
      }
      haloMat.opacity = 0.75 + 0.25 * Math.sin(t * 1.3)
    },
  }
}

// ---------------------------------------------------------------- les Chroniques

/**
 * Lutrin de pierre noire, et dessus le seul exemplaire des Chroniques de la Voie, ouvert ; une
 * page se tourne de temps en temps, et des lettres d'or s'échappent du livre. Lu de face (+z).
 */
const chroniclesLectern: Builder = ({ random }) => {
  const g = new THREE.Group()
  const stone = lit(C.stone), gold = lit(C.gold, 'metal')
  g.add(cylinder(0.2, 0.24, 0.05, stone, 0, 0.025, 0, 6), cylinder(0.07, 0.1, 0.44, stone, 0, 0.27, 0, 6))
  g.add(cylinder(0.075, 0.075, 0.012, gold, 0, 0.3, 0, 6), cylinder(0.205, 0.205, 0.008, gold, 0, 0.052, 0, 6))
  // Le pupitre incliné vers le lecteur.
  const desk = new THREE.Group()
  desk.position.set(0, 0.52, 0)
  desk.rotation.x = 0.38
  desk.add(box(0.46, 0.035, 0.32, stone, 0, 0, 0, 0.008), box(0.46, 0.02, 0.012, gold, 0, 0.02, 0.16))
  // Le livre ouvert : reliure, deux blocs de pages, et leur texte.
  desk.add(box(0.4, 0.02, 0.27, lit(C.raxxlaDark), 0, 0.027, 0, 0.004))
  const pages = drawnTexture(512, 320, (c) => {
    c.fillStyle = C.parchment
    c.fillRect(0, 0, 512, 320)
    const shade = c.createLinearGradient(236, 0, 276, 0)
    shade.addColorStop(0, 'rgba(0,0,0,0)')
    shade.addColorStop(0.5, 'rgba(60,40,10,0.35)')
    shade.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = shade
    c.fillRect(236, 0, 40, 320)
    c.fillStyle = C.ink
    c.font = '700 22px Georgia, serif'
    c.textAlign = 'center'
    c.fillText(tr('Chroniques', 'Chronicles'), 128, 44)
    c.fillText(tr('de la Voie', 'of the Path'), 128, 70)
    drawEmblem(c, 128, 170, 62, C.ink, '#8a6a2a')
    c.font = 'italic 13px Georgia, serif'
    c.fillText('SOL · 3309', 128, 268)
    // Page de droite : des lignes de texte serré, une lettrine, une note en marge.
    c.fillStyle = '#7a1a1a'
    c.font = '700 40px Georgia, serif'
    c.textAlign = 'left'
    c.fillText('L', 292, 70)
    c.fillStyle = 'rgba(42,32,20,0.75)'
    for (let y = 44; y < 290; y += 13) {
      const x0 = y < 80 ? 326 : 292
      c.fillRect(x0, y, 180 - (x0 - 292) - random() * 30, 3)
    }
    c.strokeStyle = '#7a1a1a'
    c.lineWidth = 1.5
    c.beginPath()
    c.arc(480, 200, 14, 0, Math.PI * 2)
    c.stroke()
  })
  const sheet = part(new THREE.PlaneGeometry(0.38, 0.25), new THREE.MeshLambertMaterial({ map: pages }), 0, 0.0385, 0)
  sheet.rotation.x = -Math.PI / 2
  desk.add(box(0.18, 0.012, 0.25, lit(C.parchment), -0.095, 0.032, 0), box(0.18, 0.012, 0.25, lit(C.parchment), 0.095, 0.032, 0), sheet)
  g.add(desk)
  const live = new THREE.Group()
  const turning = new THREE.Group()
  turning.position.copy(desk.position)
  turning.rotation.copy(desk.rotation)
  // La page qui se tourne pivote sur la reliure (le long de z, au milieu du livre).
  const hinge = new THREE.Group()
  hinge.position.y = 0.04
  const leaf = part(new THREE.PlaneGeometry(0.18, 0.24), new THREE.MeshLambertMaterial({ color: '#e6d9b2', side: THREE.DoubleSide }), 0.09, 0, 0)
  leaf.rotation.x = -Math.PI / 2
  hinge.add(leaf)
  turning.add(hinge)
  live.add(turning)
  // Lettres d'or qui montent du livre et s'effacent.
  const glyphTex = keepShared(drawnTexture(256, 32, (c) => {
    c.fillStyle = '#ffd87a'
    c.font = '26px Georgia, serif'
    c.textBaseline = 'middle'
    'ᚱᚨᚷᛉᛚᛟᚹᛁ'.split('').forEach((ch, i) => c.fillText(ch, 6 + i * 32, 17))
  }))
  const glyphs = Array.from({ length: 6 }, (_, i) => {
    const tex = glyphTex.clone()
    tex.repeat.set(1 / 8, 1)
    tex.offset.x = (i % 8) / 8
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const p = part(new THREE.PlaneGeometry(0.035, 0.035), m)
    live.add(p)
    return { p, m, phase: random(), x: (random() - 0.5) * 0.28, z: (random() - 0.5) * 0.12 }
  })
  return {
    solid: g,
    live,
    update(t) {
      // Toutes les 8 s, une page passe de droite à gauche en 1,2 s.
      const k = Math.min(1, (t % 8) / 1.2)
      hinge.rotation.z = ((1 - Math.cos(k * Math.PI)) / 2) * Math.PI
      hinge.visible = k < 1
      for (const gl of glyphs) {
        const u = (t * 0.18 + gl.phase) % 1
        gl.p.position.set(gl.x + Math.sin(t + gl.phase * 6) * 0.03, 0.6 + u * 0.4, gl.z)
        gl.p.rotation.y = t * 0.8 + gl.phase * 6
        gl.m.opacity = Math.sin(u * Math.PI) * 0.9
      }
    },
  }
}

// ---------------------------------------------------------------- Salomé

/**
 * Icône de Salomé (Kahina Tijani Loren), accrochée au mur : fond d'or, halo vert, cadre ouvragé ;
 * dessous, une tablette d'autel couverte d'un voile noir, des bougies votives et une rose séchée.
 * 0,9 de large.
 */
const salomeShrine: Builder = ({ random }) => {
  const g = new THREE.Group()
  const gold = lit(C.gold, 'metal'), dark = lit(C.stone)
  const icon = drawnTexture(256, 320, (c) => {
    // Fond d'or martelé.
    const bg = c.createLinearGradient(0, 0, 256, 320)
    bg.addColorStop(0, '#d9b45a')
    bg.addColorStop(0.5, '#b8913a')
    bg.addColorStop(1, '#8a6a28')
    c.fillStyle = bg
    c.fillRect(0, 0, 256, 320)
    c.fillStyle = 'rgba(255,240,200,0.12)'
    for (let i = 0; i < 90; i++) c.fillRect(random() * 256, random() * 320, 3, 3)
    // Halo vert, rayonnant, et l'emblème de la Voie derrière la tête.
    c.save()
    c.globalAlpha = 0.9
    const halo = c.createRadialGradient(128, 118, 30, 128, 118, 96)
    halo.addColorStop(0, 'rgba(15,122,90,0.95)')
    halo.addColorStop(1, 'rgba(15,122,90,0)')
    c.fillStyle = halo
    c.beginPath()
    c.arc(128, 118, 96, 0, Math.PI * 2)
    c.fill()
    c.restore()
    drawEmblem(c, 128, 112, 74, 'rgba(10,20,16,0.55)', 'rgba(255,230,160,0.5)')
    // Épaules : l'uniforme blanc et or de sénatrice impériale.
    c.fillStyle = '#ece6da'
    c.beginPath()
    c.moveTo(40, 300)
    c.quadraticCurveTo(52, 200, 128, 196)
    c.quadraticCurveTo(204, 200, 216, 300)
    c.closePath()
    c.fill()
    c.fillStyle = '#c9a24a'
    c.fillRect(120, 200, 16, 100)
    c.beginPath()
    c.moveTo(98, 200)
    c.lineTo(128, 236)
    c.lineTo(158, 200)
    c.lineTo(150, 196)
    c.lineTo(128, 222)
    c.lineTo(106, 196)
    c.closePath()
    c.fill()
    // Chevelure sombre, visage, regard baissé.
    c.fillStyle = '#1a1210'
    c.beginPath()
    c.ellipse(128, 128, 50, 62, 0, 0, Math.PI * 2)
    c.fill()
    c.fillRect(80, 128, 96, 80)
    c.fillStyle = C.skin
    c.beginPath()
    c.ellipse(128, 138, 33, 43, 0, 0, Math.PI * 2)
    c.fill()
    c.fillRect(118, 170, 20, 30)
    c.fillStyle = '#1a1210'
    c.beginPath()
    c.moveTo(94, 128)
    c.quadraticCurveTo(128, 80, 164, 126)
    c.quadraticCurveTo(140, 100, 96, 136)
    c.closePath()
    c.fill()
    c.strokeStyle = '#2a1a14'
    c.lineWidth = 3
    for (const x of [114, 142]) {
      c.beginPath()
      c.arc(x, 136, 7, 0.2, Math.PI - 0.2)
      c.stroke()
    }
    c.strokeStyle = '#8a4a40'
    c.lineWidth = 2.5
    c.beginPath()
    c.moveTo(120, 162)
    c.quadraticCurveTo(128, 166, 136, 162)
    c.stroke()
    // Une larme d'or.
    c.fillStyle = '#ffe9a0'
    c.beginPath()
    c.ellipse(144, 152, 2.5, 4, 0, 0, Math.PI * 2)
    c.fill()
    // Nom, en haut et en bas, comme sur une icône.
    c.fillStyle = '#2a1a0a'
    c.textAlign = 'center'
    c.font = '700 13px Georgia, serif'
    c.fillText('KAHINA TIJANI LOREN', 128, 24)
    c.fillStyle = C.void
    c.fillRect(0, 290, 256, 30)
    c.fillStyle = '#e0c070'
    c.font = '700 20px Georgia, serif'
    c.fillText('✦ SALOMÉ ✦', 128, 312)
  })
  // Cadre ouvragé : moulure d'or, fronton pointu.
  const Y = 0.64
  g.add(box(0.4, 0.49, 0.03, lit(C.goldDark, 'metal'), 0, Y, 0.015, 0.006))
  g.add(part(new THREE.PlaneGeometry(0.34, 0.425), new THREE.MeshLambertMaterial({ map: icon }), 0, Y, 0.031))
  for (const [w, h, x, y] of [[0.42, 0.025, 0, Y + 0.245], [0.42, 0.025, 0, Y - 0.245], [0.025, 0.5, -0.2, Y], [0.025, 0.5, 0.2, Y]] as const) {
    g.add(box(w, h, 0.04, gold, x, y, 0.02))
  }
  const tri = new THREE.Shape()
  tri.moveTo(-0.22, 0)
  tri.lineTo(0.22, 0)
  tri.lineTo(0, 0.09)
  tri.closePath()
  g.add(mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.035, bevelEnabled: false }), gold, 0, Y + 0.255, 0.005))
  g.add(sphere(0.016, glow(C.ember), 0, Y + 0.29, 0.045, 8))
  // La tablette d'autel et son voile noir brodé d'or.
  g.add(box(0.86, 0.035, 0.26, dark, 0, 0.33, 0.13, 0.008))
  for (const x of [-0.38, 0.38]) g.add(box(0.05, 0.32, 0.05, dark, x, 0.16, 0.13))
  g.add(box(0.5, 0.006, 0.27, lit('#0a0a0a'), 0, 0.35, 0.13), box(0.5, 0.12, 0.006, lit('#0a0a0a'), 0, 0.29, 0.263))
  g.add(box(0.5, 0.006, 0.008, gold, 0, 0.235, 0.266))
  // La rose séchée, couchée devant l'icône.
  const stem = cylinder(0.004, 0.004, 0.2, lit('#3a3a22'), -0.06, 0.358, 0.19, 5)
  stem.rotation.z = Math.PI / 2 - 0.2
  g.add(stem, sphere(0.022, lit('#5a1418'), 0.04, 0.37, 0.21, 8))
  // Les bougies votives : des godets de verre rouge, des flammes chaudes.
  const live = new THREE.Group()
  const flames: { f: THREE.Object3D; phase: number }[] = []
  const votives: [number, number, number][] = [[-0.32, 0.08, 1.2], [-0.24, 0.2, 0.9], [-0.17, 0.08, 1], [0.17, 0.08, 1], [0.25, 0.2, 1.1], [0.33, 0.1, 0.9]]
  for (const [x, z, s] of votives) {
    g.add(cylinder(0.022 * s, 0.02 * s, 0.045 * s, lit('#6a1a1a'), x, 0.37 + 0.0225 * s, z, 10))
    const f = flame('#ffcf6a', x, 0.37 + 0.045 * s, z, 0.9)
    live.add(f)
    flames.push({ f, phase: random() * 6 })
  }
  // Deux grands cierges sur leurs chandeliers, de part et d'autre de l'icône.
  for (const x of [-0.3, 0.3]) {
    g.add(cylinder(0.035, 0.045, 0.02, gold, x, 0.36, 0.06, 10), cylinder(0.008, 0.008, 0.08, gold, x, 0.41, 0.06, 6))
    g.add(cylinder(0.02, 0.02, 0.2, lit('#e8e0cc'), x, 0.55, 0.06, 10))
    const f = flame('#ffd88a', x, 0.65, 0.06, 1.2)
    live.add(f)
    flames.push({ f, phase: random() * 6 })
  }
  return { solid: g, live, update: (t) => flicker(flames, t) }
}

// ---------------------------------------------------------------- le terminal

/**
 * Le terminal de l'Épreuve, sur un petit bureau de métal : un vieil écran cathodique à phosphore
 * vert où l'on tape encore les commandes de la Voie (ls, cat, porte…), la clé masquée.
 */
const voieTerminal: Builder = () => {
  const g = new THREE.Group()
  const iron = lit(C.iron, 'metal'), dark = lit('#141617')
  g.add(box(0.72, 0.03, 0.38, iron, 0, 0.4, 0, 0.006))
  for (const x of [-0.33, 0.33]) for (const z of [-0.16, 0.16]) g.add(box(0.03, 0.39, 0.03, dark, x, 0.195, z))
  g.add(box(0.66, 0.02, 0.3, dark, 0, 0.12, 0))
  // L'écran cathodique : un gros boîtier, la dalle un peu en retrait.
  g.add(box(0.36, 0.3, 0.3, lit('#2c2f2a'), 0, 0.57, -0.04, 0.03), box(0.26, 0.2, 0.12, lit('#232621'), 0, 0.56, -0.24, 0.03))
  g.add(box(0.3, 0.24, 0.01, lit('#101210'), 0, 0.575, 0.11))
  g.add(box(0.46, 0.02, 0.14, lit('#2c2f2a'), 0, 0.425, 0.13, 0.006))
  for (let i = 0; i < 4; i++) g.add(box(0.4, 0.004, 0.022, lit('#3a3d38'), 0, 0.437, 0.085 + i * 0.028))
  g.add(sphere(0.008, glow('#5dff8a'), 0.15, 0.46, 0.112, 6))
  // Des câbles qui tombent jusqu'au sol, et une tasse oubliée.
  g.add(cylinder(0.008, 0.008, 0.42, lit('#111'), 0.12, 0.2, -0.17, 6), cylinder(0.008, 0.008, 0.42, lit('#111'), 0.15, 0.2, -0.16, 6))
  g.add(cylinder(0.025, 0.022, 0.06, lit('#d8d0c0'), -0.26, 0.445, 0.06, 10))
  const lines = [
    tr('--- Bienvenue Adepte de La Voie ---', '--- Welcome Adept of the Path ---'),
    tr('adepte@voie:/$ ls', 'adept@path:/$ ls'),
    tr('Epreuve/  Kahina/  Raxxla/  poeme.txt', 'Trial/  Kahina/  Raxxla/  poem.txt'),
    tr('adepte@voie:/$ cat poeme.txt', 'adept@path:/$ cat poem.txt'),
    tr('Au cœur des brumes éthérées,', 'In the heart of the ethereal mists,'),
    tr('une voie se dessine...', 'a path takes shape...'),
    tr('adepte@voie:/$ porte ▒▒▒▒▒▒▒▒▒▒▒', 'adept@path:/$ door ▒▒▒▒▒▒▒▒▒▒▒'),
    tr('La porte s\'ouvre...', 'The door opens...'),
  ]
  const LOOP = 22
  const screen = animatedScreen(256, 200, 10, (c, t) => {
    c.fillStyle = '#031006'
    c.fillRect(0, 0, 256, 200)
    const u = t % LOOP
    // Une ligne par seconde et demie ; la dernière reste, puis tout s'efface.
    const shown = Math.min(lines.length, Math.floor(u / 1.5) + 1)
    const typing = shown < lines.length
    c.font = '11px monospace'
    c.fillStyle = '#5dff8a'
    c.shadowColor = '#5dff8a'
    c.shadowBlur = 4
    let last = ''
    for (let i = 0; i < shown; i++) {
      // La ligne en cours se tape lettre à lettre.
      last = typing && i === shown - 1 ? lines[i].slice(0, Math.floor(Math.min(1, (u % 1.5) / 1.2) * lines[i].length)) : lines[i]
      c.fillText(last, 8, 18 + i * 20)
    }
    c.shadowBlur = 0
    // Le curseur clignote au bout de la ligne en cours, ou sous la dernière.
    if (Math.floor(t * 2) % 2 === 0) {
      const row = typing ? shown - 1 : shown
      c.fillRect(8 + (typing ? c.measureText(last).width : 0), 9 + row * 20, 7, 11)
    }
    // De temps en temps, l'image se brouille : KAHINA apparaît, puis disparaît.
    if (u > 17 && u < 17.6) {
      c.fillStyle = 'rgba(93,255,138,0.25)'
      for (let y = 0; y < 200; y += 6) c.fillRect((y * 37) % 30 - 15, y, 256, 2)
      c.fillStyle = '#ffffff'
      c.font = '700 34px monospace'
      c.fillText('KAHINA', 64 + Math.sin(t * 90) * 4, 110)
    }
    // Balayage du tube.
    c.fillStyle = 'rgba(0,0,0,0.25)'
    for (let y = 0; y < 200; y += 3) c.fillRect(0, y, 256, 1)
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.27, 0.21), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.575, 0.117))
  return { solid: g, live, update: (t) => screen.tick(t) }
}

// ---------------------------------------------------------------- les Reliques

/**
 * Une des trois Reliques de la Voie, sur sa colonne hexagonale sous une cloche de verre : elle
 * flotte et tourne sur elle-même. `label` : 'shard' (l'éclat vert), 'medallion' (le médaillon de
 * l'emblème) ou 'eye' (l'œil du néant, cerclé de violet).
 */
const voieRelic: Builder = ({ label }) => {
  const g = new THREE.Group()
  const stone = lit(C.stone), gold = lit(C.gold, 'metal')
  g.add(cylinder(0.15, 0.17, 0.05, stone, 0, 0.025, 0, 6), cylinder(0.1, 0.12, 0.42, stone, 0, 0.26, 0, 6))
  g.add(cylinder(0.14, 0.12, 0.04, stone, 0, 0.49, 0, 6), cylinder(0.142, 0.142, 0.008, gold, 0, 0.508, 0, 6), cylinder(0.128, 0.128, 0.01, stone, 0, 0.512, 0, 6))
  g.add(cylinder(0.105, 0.105, 0.006, gold, 0, 0.36, 0, 6))
  const kind = label === 'medallion' || label === 'eye' ? label : 'shard'
  const numeral = { shard: 'I', medallion: 'II', eye: 'III' }[kind]
  const plate = drawnTexture(64, 32, (c) => {
    c.fillStyle = C.void
    c.fillRect(0, 0, 64, 32)
    c.fillStyle = C.gold
    c.font = '700 20px Georgia, serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(numeral, 32, 17)
  })
  g.add(part(new THREE.PlaneGeometry(0.07, 0.035), new THREE.MeshBasicMaterial({ map: plate }), 0, 0.3, 0.113))
  const live = new THREE.Group()
  live.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 18, 1, true), glass('#d8fff0', 0.16), 0, 0.625, 0))
  live.add(part(new THREE.SphereGeometry(0.1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass('#d8fff0', 0.16), 0, 0.735, 0))
  const relic = new THREE.Group()
  relic.position.y = 0.61
  let color = C.ember
  if (kind === 'shard') {
    const core = mesh(new THREE.OctahedronGeometry(0.04, 0), glow('#9dffd4'))
    core.scale.set(0.8, 1.5, 0.8)
    relic.add(core)
    for (let i = 0; i < 3; i++) {
      const p = mesh(new THREE.OctahedronGeometry(0.018, 0), glow(C.ember), Math.cos(i * 2.1) * 0.035, -0.02 + i * 0.02, Math.sin(i * 2.1) * 0.035)
      p.scale.set(0.7, 1.6, 0.7)
      relic.add(p)
    }
  } else if (kind === 'medallion') {
    color = '#ffd87a'
    const face = drawnTexture(128, 128, (c) => {
      c.fillStyle = '#c9a24a'
      c.fillRect(0, 0, 128, 128)
      drawEmblem(c, 64, 64, 56, '#5a4418', '#fff0b0')
    })
    const faceMat = new THREE.MeshLambertMaterial({ map: face })
    // Tranche d'or, l'emblème frappé sur les deux faces.
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 6), [lit(C.gold, 'metal'), faceMat, faceMat])
    coin.rotation.x = Math.PI / 2
    relic.add(coin)
  } else {
    color = C.violet
    relic.add(mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: C.void })))
    const ring = part(new THREE.TorusGeometry(0.055, 0.004, 4, 32), glow(C.violet))
    ring.rotation.x = Math.PI / 2.4
    relic.add(ring)
    relic.add(sphere(0.009, glow('#ffffff'), 0.012, 0.012, 0.03, 8))
  }
  live.add(relic)
  // Lueur au pied de la relique.
  const glowRing = part(new THREE.CircleGeometry(0.09, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.519, 0)
  glowRing.rotation.x = -Math.PI / 2
  live.add(glowRing)
  const phase = kind === 'shard' ? 0 : kind === 'medallion' ? 2 : 4
  return {
    solid: g,
    live,
    update(t) {
      relic.position.y = 0.61 + Math.sin(t * 1.2 + phase) * 0.015
      relic.rotation.y = t * (kind === 'eye' ? -0.7 : 0.9)
      ;(glowRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(t * 2 + phase)
    },
  }
}

// ---------------------------------------------------------------- robes et Dark Wheel

/** Patère de bois noir et trois robes d'adepte à capuche, vert-noir, galonnées d'or. 0,8 de large. */
const adeptRobes: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.78, 0.06, 0.025, lit('#140f0c'), 0, 0.86, 0.0125, 0.006))
  for (const x of [-0.25, 0, 0.25]) {
    g.add(cylinder(0.01, 0.01, 0.06, lit(C.gold, 'metal'), x, 0.86, 0.05, 6).rotateX(Math.PI / 2))
    // Robe : cône aplati qui tombe du crochet, capuche retombant dans le dos.
    const robe = mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.62, 10), lit(C.robe, 'cloth'), x, 0.54, 0.07)
    robe.scale.z = 0.45
    g.add(robe)
    const hood = sphere(0.06, lit(C.velvetDark, 'cloth'), x, 0.8, 0.075, 10)
    hood.scale.set(1, 1.1, 0.7)
    g.add(hood)
    g.add(box(0.2, 0.012, 0.004, lit(C.gold, 'metal'), x, 0.25, 0.1308), sphere(0.012, glow(C.ember), x, 0.72, 0.103, 6))
  }
  return { solid: g }
}

/**
 * La roue du Dark Wheel, qui a refusé le Guide : un disque de fer à huit rayons, fendu, cloué au
 * mur par une dague, barré de rouge.
 */
const darkWheelDagger: Builder = () => {
  const g = new THREE.Group()
  const iron = lit(C.iron, 'metal'), Y = 0.6
  const wheel = mesh(new THREE.TorusGeometry(0.15, 0.018, 6, 24, Math.PI * 1.8), iron, 0, Y, 0.025)
  wheel.rotation.z = 0.5
  g.add(wheel, cylinder(0.035, 0.035, 0.03, iron, 0, Y, 0.025, 12).rotateX(Math.PI / 2))
  for (let i = 0; i < 8; i++) {
    if (i === 3) continue
    const a = (i / 8) * Math.PI * 2
    const s = box(0.015, 0.13, 0.012, iron, Math.cos(a) * 0.085, Y + Math.sin(a) * 0.085, 0.025)
    s.rotation.z = a - Math.PI / 2
    g.add(s)
  }
  // Le trait rouge, en travers.
  const slash = box(0.4, 0.022, 0.004, lit(C.blood), 0, Y, 0.046)
  slash.rotation.z = -0.6
  g.add(slash)
  // La dague, plantée en biais dans le moyeu.
  const dagger = new THREE.Group()
  dagger.position.set(0.01, Y + 0.01, 0.04)
  dagger.rotation.set(-0.5, 0, 0.35)
  dagger.add(box(0.018, 0.008, 0.12, lit('#b8c0c8'), 0, 0, 0.02), box(0.08, 0.012, 0.014, lit(C.gold, 'metal'), 0, 0, 0.085), cylinder(0.009, 0.009, 0.07, lit('#1a1210'), 0, 0, 0.125, 6).rotateX(Math.PI / 2), sphere(0.014, lit(C.gold, 'metal'), 0, 0, 0.165, 8))
  g.add(dagger)
  return { solid: g }
}

// ---------------------------------------------------------------- l'Adepte Supérieur

/**
 * L'Adepte Supérieur : une silhouette en robe, capuche rabattue, sans visage ; deux yeux verts
 * qui clignent rarement, les mains jointes dans les manches, l'emblème qui luit sur la poitrine.
 * Il flotte à peine au-dessus du sol. Un volume fixe sert aux collisions et au clic.
 */
const voieAdept: Builder = ({ random }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.14, 0.14, 0.004, lit('#040605'), 0, 0.002, 0, 18))
  const live = new THREE.Group()
  const body = new THREE.Group()
  live.add(body)
  const robe = lit(C.robe, 'cloth'), velvet = lit(C.velvetDark, 'cloth')
  // La robe : une cloche qui s'évase jusqu'au sol.
  const profile = [
    new THREE.Vector2(0.001, 0.62),
    new THREE.Vector2(0.1, 0.61),
    new THREE.Vector2(0.13, 0.5),
    new THREE.Vector2(0.14, 0.3),
    new THREE.Vector2(0.19, 0.04),
    new THREE.Vector2(0.2, 0.02),
    new THREE.Vector2(0.001, 0.02),
  ]
  const skirt = mesh(new THREE.LatheGeometry(profile, 14), robe)
  // L'ourlet luit faiblement : on devine la silhouette dans le noir.
  body.add(skirt, part(new THREE.CylinderGeometry(0.197, 0.197, 0.018, 14, 1, true), glow('#3fae86'), 0, 0.045, 0))
  // Les manches jointes devant, les mains cachées dedans.
  for (const side of [-1, 1]) {
    const sleeve = mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.22, 8), robe, side * 0.07, 0.46, 0.09)
    sleeve.rotation.set(1.2, 0, side * 0.6)
    body.add(sleeve)
  }
  body.add(sphere(0.045, velvet, 0, 0.44, 0.15, 8))
  // La capuche : une sphère creuse, une pointe, et le noir à la place du visage.
  const hood = mesh(new THREE.SphereGeometry(0.1, 14, 10), velvet, 0, 0.72, 0)
  hood.scale.set(0.95, 1.08, 1)
  const tip = mesh(new THREE.ConeGeometry(0.06, 0.12, 10), velvet, 0, 0.8, -0.05)
  tip.rotation.x = -0.9
  const face = part(new THREE.CircleGeometry(0.068, 16), new THREE.MeshBasicMaterial({ color: '#000000' }), 0, 0.705, 0.102)
  face.scale.y = 1.2
  body.add(hood, tip, face, mesh(new THREE.TorusGeometry(0.074, 0.01, 6, 16), lit('#050a08'), 0, 0.705, 0.098))
  // Le col et l'emblème pendu sur la poitrine.
  body.add(mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.04, 12), velvet, 0, 0.62, 0))
  const pendant = part(new THREE.CircleGeometry(0.03, 6), glow(C.ember), 0, 0.55, 0.128)
  pendant.rotation.x = -0.2
  body.add(pendant, part(new THREE.CircleGeometry(0.036, 6), glow(C.gold), 0, 0.551, 0.126).rotateX(-0.2))
  const eyes = new THREE.Group()
  for (const x of [-0.026, 0.026]) eyes.add(part(new THREE.SphereGeometry(0.012, 8, 6), glow(C.ember), x, 0.715, 0.106))
  body.add(eyes)
  // Il ne touche pas le sol : un halo vert pulse sous lui.
  const auraMat = new THREE.MeshBasicMaterial({ color: C.ember, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  const aura = part(new THREE.CircleGeometry(0.26, 24), auraMat, 0, 0.006, 0)
  aura.rotation.x = -Math.PI / 2
  live.add(aura)
  const extent = new THREE.Box3(new THREE.Vector3(-0.18, 0, -0.18), new THREE.Vector3(0.18, 0.86, 0.18))
  const phase = random() * 10
  return {
    solid: g,
    live,
    extent,
    update(t) {
      body.position.y = 0.03 + Math.sin(t * 0.9 + phase) * 0.012
      body.rotation.y = Math.sin(t * 0.21 + phase) * 0.18
      auraMat.opacity = 0.2 + 0.12 * Math.sin(t * 0.9 + phase)
      // Un clignement toutes les 7 s environ, deux fois de suite une fois sur trois.
      const u = (t + phase) % 7
      eyes.scale.y = u < 0.12 || (Math.floor((t + phase) / 7) % 3 === 0 && u > 0.3 && u < 0.42) ? 0.1 : 1
    },
  }
}

export const VOIE = {
  'voie-floor': voieFloor,
  'voie-drape': voieDrape,
  'raxxla-gate': raxxlaGate,
  'chronicles-lectern': chroniclesLectern,
  'salome-shrine': salomeShrine,
  'voie-terminal': voieTerminal,
  'voie-relic': voieRelic,
  'adept-robes': adeptRobes,
  'dark-wheel-dagger': darkWheelDagger,
  'voie-adept': voieAdept,
} satisfies Record<string, Builder>
