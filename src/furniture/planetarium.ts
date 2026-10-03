import * as THREE from 'three'
import { beamMaterial, box, cylinder, decal, drawnTexture, glow, keepShared, lit, mesh, part, pointCloud, sphere, type Builder } from './kit'

/*
 * Le planétarium de Bugenhagen, au pont supérieur, à la place des anciens quartiers : un clin
 * d'œil à l'observatoire de Cosmo Canyon, dans le Final Fantasy VII d'origine (PS1). Au centre, le
 * projecteur ; tout autour, l'hologramme du système qui emplit la pièce : une sphère céleste
 * quadrillée de blanc, les orbites en anneaux rouges, le soleil au milieu, des planètes et de gros
 * astres de cristal, taillés à facettes, qui tournent lentement. On marche dedans, entre les
 * planètes. Bugenhagen y flotte, sur sa boule verte. Autour : la carte du ciel au sol, la lunette,
 * la bibliothèque du vieux sage.
 * Les modèles « PS1 » (Bugenhagen, les astres de cristal) sont à facettes, sans lissage.
 */

const C = {
  wood: '#5a3b22',
  woodDark: '#3a2516',
  brass: '#c79a46',
  brassDark: '#8a6526',
  night: '#0b1030',
  nightEdge: '#141a46',
  gold: '#d8b25a',
  orbit: '#ff3b26',
  grid: '#c4d6ff',
  sun: '#fff0b8',
  lens: '#bfe8ff',
  // Bugenhagen, d'après son modèle du jeu.
  skin: '#e2894b',
  robe: '#2b2c7e',
  robeDark: '#20206a',
  band: '#d69b3a',
  bandDark: '#6b3a16',
  beard: '#ecebe4',
  beardShade: '#bdbdb6',
  orb: '#3f9c3a',
  lensDark: '#121218',
  rim: '#9aa0aa',
}

/** Matériau à facettes, à la façon des modèles de la PS1 (partagé). */
const facets = new Map<string, THREE.MeshLambertMaterial>()
function faceted(color: string, emissive = 0): THREE.MeshLambertMaterial {
  const key = `${color}:${emissive}`
  let m = facets.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true })
    if (emissive) m.emissive.set(color).multiplyScalar(emissive)
    facets.set(key, keepShared(m))
  }
  return m
}

/** Pièce à facettes d'un personnage animé (dans `live` : pas de fusion, pas d'ombre). */
const facet = (geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) => part(geo, faceted(color), x, y, z)

/** Pièce allongée de `from` à `to` (un cône a sa pointe en `to`). */
function strand(geo: THREE.BufferGeometry, color: string, from: THREE.Vector3, to: THREE.Vector3): THREE.Mesh {
  const m = facet(geo, color)
  m.position.copy(from).add(to).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
  return m
}

/** Rocher de cristal à facettes : un icosaèdre aux sommets déplacés (les faces restent jointives). */
function crystalGeometry(random: () => number, size: number, stretch = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(size, 0)
  const pos = geo.attributes.position
  const bumps = new Map<string, number>()
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`
    let k = bumps.get(key)
    if (k === undefined) bumps.set(key, (k = 0.72 + random() * 0.5))
    pos.setXYZ(i, v.x * k, v.y * k * stretch, v.z * k)
  }
  geo.computeVertexNormals()
  return geo
}

/** Halo rond, en dégradé (le soleil, la lentille du projecteur). */
function haloTexture(color: string): THREE.CanvasTexture {
  return drawnTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, color)
    g.addColorStop(0.25, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.fillRect(0, 0, 128, 128)
  })
}

function halo(color: string, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }))
  s.scale.setScalar(size)
  return s
}

// ---------------------------------------------------------------- le sol

/**
 * La carte du ciel, de mur à mur (7,6 × 7,6) : bleu de nuit, étoiles semées, constellations
 * reliées d'un trait, et au centre, autour du projecteur, l'anneau des douze signes en laiton,
 * une rose des vents dont la pointe nord montre la porte.
 */
const planetariumFloor: Builder = ({ random }) => {
  const S = 7.6, PX = 1024, K = PX / S
  const map = drawnTexture(PX, PX, (c) => {
    const bg = c.createRadialGradient(PX / 2, PX / 2, 0, PX / 2, PX / 2, PX * 0.7)
    bg.addColorStop(0, C.nightEdge)
    bg.addColorStop(1, C.night)
    c.fillStyle = bg
    c.fillRect(0, 0, PX, PX)
    // Les étoiles, et quelques constellations.
    for (let i = 0; i < 520; i++) {
      const r = random() < 0.92 ? 0.6 + random() * 1.2 : 2 + random() * 1.6
      c.fillStyle = ['#ffffff', '#cfe0ff', '#fff2c4', '#ffd0d0'][Math.floor(random() * 4)]
      c.globalAlpha = 0.35 + random() * 0.6
      c.beginPath()
      c.arc(random() * PX, random() * PX, r, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
    for (let n = 0; n < 9; n++) {
      const a = (n / 9) * Math.PI * 2 + random()
      const d = PX * (0.36 + random() * 0.08)
      let x = PX / 2 + Math.cos(a) * d, y = PX / 2 + Math.sin(a) * d
      const pts: [number, number][] = [[x, y]]
      for (let i = 0; i < 3 + Math.floor(random() * 3); i++) {
        x += (random() - 0.5) * 90
        y += (random() - 0.5) * 90
        pts.push([x, y])
      }
      c.strokeStyle = 'rgba(190,210,255,0.45)'
      c.lineWidth = 1.5
      c.beginPath()
      for (const [px, py] of pts) c.lineTo(px, py)
      c.stroke()
      c.fillStyle = '#ffffff'
      for (const [px, py] of pts) {
        c.beginPath()
        c.arc(px, py, 3, 0, Math.PI * 2)
        c.fill()
      }
    }
    // L'anneau des signes, en laiton.
    const cx = PX / 2, cy = PX / 2
    c.strokeStyle = C.gold
    for (const [r, w] of [[2.0, 5], [1.62, 3], [1.1, 2]] as const) {
      c.lineWidth = w
      c.beginPath()
      c.arc(cx, cy, r * K, 0, Math.PI * 2)
      c.stroke()
    }
    c.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      c.beginPath()
      c.moveTo(cx + Math.cos(a) * 1.62 * K, cy + Math.sin(a) * 1.62 * K)
      c.lineTo(cx + Math.cos(a) * 2.0 * K, cy + Math.sin(a) * 2.0 * K)
      c.stroke()
      // Un signe par case : un petit astre et ses rayons.
      const m = a + Math.PI / 12, gx = cx + Math.cos(m) * 1.81 * K, gy = cy + Math.sin(m) * 1.81 * K
      c.fillStyle = C.gold
      c.beginPath()
      c.arc(gx, gy, 6, 0, Math.PI * 2)
      c.fill()
      for (let k = 0; k < (i % 4) + 2; k++) {
        const b = (k / ((i % 4) + 2)) * Math.PI * 2 + i
        c.beginPath()
        c.moveTo(gx + Math.cos(b) * 9, gy + Math.sin(b) * 9)
        c.lineTo(gx + Math.cos(b) * 16, gy + Math.sin(b) * 16)
        c.stroke()
      }
    }
    // La rose des vents : sa pointe nord vers la porte.
    c.fillStyle = 'rgba(216,178,90,0.55)'
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, l = (i % 2 ? 0.75 : 1.45) * K
      c.beginPath()
      c.moveTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l)
      c.lineTo(cx + Math.cos(a + 0.5) * 0.18 * K, cy + Math.sin(a + 0.5) * 0.18 * K)
      c.lineTo(cx + Math.cos(a - 0.5) * 0.18 * K, cy + Math.sin(a - 0.5) * 0.18 * K)
      c.closePath()
      c.fill()
    }
  })
  const g = new THREE.Group()
  g.add(decal(map, S, S, 0.004))
  return { solid: g }
}

// ---------------------------------------------------------------- le projecteur

/** Hauteur du plan des orbites, au-dessus des têtes (ou presque). */
const SKY_Y = 1.3

/**
 * Le projecteur, au centre : une estrade ronde en bois cerclée de laiton, une colonne, trois arcs
 * qui tiennent la lentille ; la lentille luit et projette vers le soleil un faisceau pâle.
 */
const planetariumProjector: Builder = () => {
  const g = new THREE.Group()
  const brass = lit(C.brass), brassDark = lit(C.brassDark)
  g.add(cylinder(0.44, 0.48, 0.1, lit(C.wood), 0, 0.05, 0, 20))
  g.add(cylinder(0.49, 0.49, 0.025, brassDark, 0, 0.012, 0, 20), cylinder(0.445, 0.445, 0.02, brass, 0, 0.105, 0, 20))
  g.add(cylinder(0.16, 0.2, 0.08, lit(C.woodDark), 0, 0.14, 0, 12))
  g.add(cylinder(0.06, 0.08, 0.26, brass, 0, 0.3, 0, 10))
  g.add(cylinder(0.11, 0.07, 0.05, brassDark, 0, 0.44, 0, 12))
  // Les trois arcs de la monture, autour de la lentille.
  for (let i = 0; i < 3; i++) {
    const arc = mesh(new THREE.TorusGeometry(0.12, 0.009, 5, 16, Math.PI), brass, 0, 0.55, 0)
    arc.rotation.set(0, (i / 3) * Math.PI, 0)
    g.add(arc)
  }
  // Quatre petites lanternes sur l'estrade.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    g.add(cylinder(0.025, 0.03, 0.05, brassDark, Math.cos(a) * 0.36, 0.125, Math.sin(a) * 0.36, 8))
    g.add(part(new THREE.SphereGeometry(0.018, 8, 6), glow('#ffd88a'), Math.cos(a) * 0.36, 0.165, Math.sin(a) * 0.36))
  }
  const live = new THREE.Group()
  const lens = part(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshBasicMaterial({ color: C.lens }), 0, 0.55, 0)
  const flare = halo(C.lens, 0.42, 0.7)
  flare.position.y = 0.55
  const beamMat = beamMaterial(true)
  beamMat.uniforms.uColor.value.set('#9fd4ff')
  beamMat.uniforms.uIntensity.value = 0.35
  const beam = part(new THREE.CylinderGeometry(0.05, 0.12, SKY_Y - 0.6, 16, 1, true), beamMat, 0, (SKY_Y + 0.6) / 2, 0)
  beam.rotation.x = Math.PI
  live.add(lens, flare, beam)
  return {
    solid: g,
    live,
    update(t) {
      lens.rotation.y = t * 0.6
      flare.material.opacity = 0.55 + 0.15 * Math.sin(t * 2.3)
      beamMat.uniforms.uTime.value = t
    },
  }
}

// ---------------------------------------------------------------- l'hologramme

interface Body {
  object: THREE.Object3D
  radius: number
  speed: number
  phase: number
  spin: number
}

/**
 * Le système qui emplit la pièce, comme dans l'observatoire de Bugenhagen : la sphère céleste,
 * quadrillée de blanc, qui tourne lentement ; les orbites en anneaux rouges, à peine inclinées ;
 * le soleil, et autour de lui une planète tellurique, une planète bleue et sa lune, une rouge,
 * la géante aux anneaux, et trois gros astres de cristal (vert pâle, bleu, émeraude) à facettes.
 * Des étoiles flottent partout. Rien n'y est solide : on traverse l'hologramme.
 */
const planetariumSky: Builder = ({ random }) => {
  const live = new THREE.Group()
  // La sphère céleste : méridiens et parallèles, une coupole écrasée qui frôle les murs.
  const R = 3.4, V = 1.6, Y0 = 0.15
  const pts: THREE.Vector3[] = []
  const at = (phi: number, theta: number) => new THREE.Vector3(R * Math.cos(phi) * Math.cos(theta), Y0 + V * Math.sin(phi), R * Math.cos(phi) * Math.sin(theta))
  for (let m = 0; m < 16; m++) {
    const theta = (m / 16) * Math.PI * 2
    for (let i = 0; i < 12; i++) pts.push(at((i / 12) * (Math.PI / 2), theta), at(((i + 1) / 12) * (Math.PI / 2), theta))
  }
  for (const phi of [0.12, 0.38, 0.66, 0.96, 1.26]) {
    for (let i = 0; i < 64; i++) pts.push(at(phi, (i / 64) * Math.PI * 2), at(phi, ((i + 1) / 64) * Math.PI * 2))
  }
  const gridMat = new THREE.LineBasicMaterial({ color: C.grid, transparent: true, opacity: 0.3, depthWrite: false })
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), gridMat)
  live.add(grid)

  // Les étoiles : sur la coupole, et quelques-unes en suspens dans la pièce.
  const N = 320
  const positions = new Float32Array(N * 3), colors = new Float32Array(N * 3), sizes = new Float32Array(N)
  const tint = new THREE.Color()
  for (let i = 0; i < N; i++) {
    const inside = i % 4 === 0
    const phi = Math.asin(random()) * (inside ? 0.9 : 1), theta = random() * Math.PI * 2, k = inside ? 0.25 + random() * 0.65 : 0.985
    const p = at(phi, theta)
    positions.set([p.x * k, Y0 + (p.y - Y0) * k + (inside ? 0.5 : 0), p.z * k], i * 3)
    tint.set(['#ffffff', '#cfe0ff', '#fff1c0', '#ffc8c8'][Math.floor(random() * 4)])
    colors.set([tint.r, tint.g, tint.b], i * 3)
    sizes[i] = 0.025 + random() * random() * 0.06
  }
  live.add(pointCloud(positions, colors, sizes))

  // Le système, sur son plan à peine incliné.
  const system = new THREE.Group()
  system.position.y = SKY_Y
  system.rotation.set(0.09, 0, -0.05)
  live.add(system)
  const orbits = [0.45, 0.8, 1.15, 1.55, 2.0, 2.45, 2.85]
  const rings = orbits.map((r) => {
    const t = new THREE.TorusGeometry(r, 0.011, 4, Math.round(40 + r * 30))
    t.rotateX(Math.PI / 2)
    return t
  })
  const ringMat = new THREE.MeshBasicMaterial({ color: C.orbit, transparent: true, opacity: 0.9, depthWrite: false })
  for (const geo of rings) system.add(part(geo, ringMat))

  // Le soleil : une boule blanche et sa couronne.
  const sun = part(new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshBasicMaterial({ color: C.sun }))
  const corona = halo('#ffe08a', 0.95)
  const glare = halo('#ffffff', 0.4)
  system.add(sun, corona, glare)

  const bodies: Body[] = []
  const add = (object: THREE.Object3D, orbit: number, speed: number, spin = 0.4) => {
    bodies.push({ object, radius: orbits[orbit], speed, phase: random() * Math.PI * 2, spin })
    system.add(object)
  }
  // Une petite planète tellurique, grise.
  add(part(new THREE.IcosahedronGeometry(0.045, 0), faceted('#a59a8c', 0.35)), 0, 0.42)
  // La planète bleue et sa lune.
  const blue = new THREE.Group()
  blue.add(part(new THREE.IcosahedronGeometry(0.075, 1), faceted('#3f86d8', 0.4)))
  const moon = part(new THREE.IcosahedronGeometry(0.022, 0), faceted('#d8d8d0', 0.4), 0.13, 0.02, 0)
  blue.add(moon)
  add(blue, 1, 0.3, 1.2)
  // La rouge.
  add(part(new THREE.IcosahedronGeometry(0.06, 1), faceted('#c8502e', 0.4)), 2, 0.22)
  // Le gros astre de cristal vert pâle.
  add(part(crystalGeometry(random, 0.22, 1.25), faceted('#cfdc8e', 0.3)), 3, 0.15, 0.25)
  // La géante aux anneaux, à bandes.
  const giant = new THREE.Group()
  const bands = drawnTexture(64, 128, (c) => {
    const cols = ['#c98a4a', '#e0b07a', '#a8683a', '#d8a066', '#8a5230', '#e8c08a']
    for (let y = 0; y < 128; y += 8) {
      c.fillStyle = cols[Math.floor(random() * cols.length)]
      c.fillRect(0, y, 64, 8 + random() * 8)
    }
  })
  giant.add(part(new THREE.SphereGeometry(0.2, 18, 12), new THREE.MeshLambertMaterial({ map: bands, emissive: '#ffffff', emissiveMap: bands, emissiveIntensity: 0.4 })))
  const ringTex = drawnTexture(128, 4, (c) => {
    for (let x = 0; x < 128; x += 4) {
      c.fillStyle = `rgba(232,208,160,${0.3 + random() * 0.6})`
      c.fillRect(x, 0, 4, 4)
    }
  })
  const ringGeo = new THREE.RingGeometry(0.27, 0.46, 48, 1)
  // La texture court du bord intérieur au bord extérieur.
  const uv = ringGeo.attributes.uv, rp = ringGeo.attributes.position
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (Math.hypot(rp.getX(i), rp.getY(i)) - 0.27) / 0.19, 0.5)
  const giantRing = part(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
  giantRing.rotation.set(-Math.PI / 2 + 0.45, 0, 0.2)
  giant.add(giantRing)
  add(giant, 4, 0.11, 0.6)
  // Le grand astre de cristal bleu.
  add(part(crystalGeometry(random, 0.26, 1.15), faceted('#8ea4ff', 0.3)), 5, 0.085, 0.2)
  // L'émeraude, et un caillou brun qui la suit sur la dernière orbite.
  add(part(crystalGeometry(random, 0.13, 1.1), faceted('#3fbf96', 0.35)), 6, 0.065, 0.5)
  add(part(crystalGeometry(random, 0.08, 0.9), faceted('#9a6a4a', 0.3)), 6, 0.065, 0.7)
  bodies[bodies.length - 1].phase = bodies[bodies.length - 2].phase + 0.5

  return {
    live,
    update(t) {
      grid.rotation.y = t * 0.02
      for (const b of bodies) {
        const a = b.phase + t * b.speed
        b.object.position.set(Math.cos(a) * b.radius, 0, -Math.sin(a) * b.radius)
        b.object.rotation.y = t * b.spin
      }
      moon.position.set(Math.cos(t * 1.4) * 0.13, 0.02, -Math.sin(t * 1.4) * 0.13)
      sun.rotation.y = t * 0.3
      const pulse = 1 + 0.06 * Math.sin(t * 1.7) + 0.03 * Math.sin(t * 4.1)
      corona.scale.setScalar(0.95 * pulse)
    },
  }
}

// ---------------------------------------------------------------- Bugenhagen

/**
 * Bugenhagen, le vieux sage de Cosmo Canyon, à la façon de son modèle du jeu sur PS1 : crâne
 * chauve couleur de cuivre, lunettes rondes aux verres noirs, couronne de cheveux blancs,
 * immense moustache qui retombe jusqu'au torse, longue robe bleu nuit à haut col et bande dorée
 * sur le devant. En guise de jambes, sa boule verte : il flotte, et ne touche jamais le sol. Il
 * regarde les étoiles autour de lui, et de temps en temps rit tout seul (« Hou hou hou ! »).
 * Construit face à +z, tourné d'un huitième de tour vers +x (vers la caméra au départ).
 */
const bugenhagen: Builder = ({ random }) => {
  const live = new THREE.Group()
  const body = new THREE.Group()
  live.add(body)
  // La boule verte, sous la robe.
  const orb = facet(new THREE.SphereGeometry(0.132, 8, 5), C.orb, 0, 0.11, 0)
  orb.scale.y = 0.85
  body.add(orb)
  // La robe : une jupe octogonale, le buste, les épaules larges, le haut col.
  const skirt = facet(new THREE.CylinderGeometry(0.125, 0.152, 0.3, 8).rotateY(Math.PI / 8), C.robe, 0, 0.27, 0)
  const chest = facet(new THREE.CylinderGeometry(0.148, 0.125, 0.17, 8).rotateY(Math.PI / 8), C.robe, 0, 0.505, 0)
  body.add(skirt, chest)
  for (const side of [-1, 1]) {
    const shoulder = facet(new THREE.SphereGeometry(0.07, 6, 4), C.robe, side * 0.125, 0.56, -0.005)
    shoulder.scale.set(1.1, 0.75, 1)
    // Les manches, le long du corps, et les mains qui en sortent à peine.
    const sleeve = facet(new THREE.CylinderGeometry(0.045, 0.062, 0.25, 6), C.robeDark, side * 0.168, 0.43, 0)
    sleeve.rotation.z = side * 0.14
    body.add(shoulder, sleeve, facet(new THREE.SphereGeometry(0.03, 5, 4), C.skin, side * 0.19, 0.295, 0.01))
  }
  body.add(facet(new THREE.CylinderGeometry(0.075, 0.1, 0.07, 8), C.robeDark, 0, 0.6, 0))
  // La bande dorée du devant, et son liseré brun, qui suivent la pente de la jupe.
  for (const [w, color, dz] of [[0.075, C.band, 0], [0.022, C.bandDark, 0.004]] as const) {
    const low = facet(new THREE.BoxGeometry(w, 0.3, 0.008), color, 0, 0.27, 0.128 + dz)
    low.rotation.x = -0.1
    const high = facet(new THREE.BoxGeometry(w, 0.15, 0.008), color, 0, 0.5, 0.127 + dz)
    high.rotation.x = 0.13
    body.add(low, high)
  }

  // La tête : chauve, cuivrée, un peu allongée.
  const head = new THREE.Group()
  head.position.y = 0.71
  // Une tête un peu grosse pour le corps, comme sur la PS1.
  head.scale.setScalar(1.12)
  body.add(head)
  const skull = facet(new THREE.SphereGeometry(0.085, 8, 6), C.skin)
  skull.scale.set(0.95, 1.12, 1)
  head.add(skull)
  for (const side of [-1, 1]) {
    head.add(facet(new THREE.SphereGeometry(0.02, 5, 4), C.skin, side * 0.082, -0.01, 0))
    // La couronne de cheveux blancs, au-dessus des oreilles et derrière.
    const tuft = facet(new THREE.SphereGeometry(0.042, 5, 4), C.beard, side * 0.082, -0.022, -0.035)
    tuft.scale.set(0.9, 1.05, 1.4)
    head.add(tuft)
    // Les lunettes rondes : verre noir, monture grise, un reflet.
    const lens = new THREE.Group()
    lens.position.set(side * 0.033, 0.006, 0.08)
    lens.rotation.y = side * 0.38
    const glass = part(new THREE.CircleGeometry(0.026, 10), new THREE.MeshBasicMaterial({ color: C.lensDark }))
    const rim = facet(new THREE.TorusGeometry(0.026, 0.0055, 4, 10), C.rim)
    const glint = part(new THREE.CircleGeometry(0.007, 6), glow('#d8dce8'), side * -0.009, 0.01, 0.001)
    lens.add(glass, rim, glint)
    head.add(lens)
    // Les sourcils, broussailleux.
    const brow = facet(new THREE.BoxGeometry(0.04, 0.012, 0.014), C.beard, side * 0.035, 0.04, 0.078)
    brow.rotation.z = side * -0.25
    head.add(brow)
    // La moustache : deux mèches qui partent sous le nez et retombent sur la poitrine.
    head.add(strand(new THREE.ConeGeometry(0.038, 1, 5).scale(1, 0.24, 1), C.beard, new THREE.Vector3(side * 0.03, -0.045, 0.085), new THREE.Vector3(side * 0.12, -0.225, 0.1)))
  }
  const back = facet(new THREE.SphereGeometry(0.045, 6, 4), C.beard, 0, -0.03, -0.065)
  back.scale.set(1.5, 0.9, 0.7)
  head.add(back)
  const nose = facet(new THREE.ConeGeometry(0.017, 0.045, 5), C.skin, 0, -0.012, 0.092)
  nose.rotation.x = Math.PI / 2
  head.add(nose)
  const lip = facet(new THREE.SphereGeometry(0.04, 6, 4), C.beard, 0, -0.05, 0.072)
  lip.scale.set(1.7, 0.7, 0.85)
  head.add(lip)
  head.add(part(new THREE.BoxGeometry(0.014, 0.005, 0.006), lit(C.rim), 0, 0.006, 0.089))
  // La barbe, longue, en pointe, sur la bande dorée.
  const beard = new THREE.Group()
  beard.position.set(0, -0.06, 0.07)
  head.add(beard)
  beard.add(strand(new THREE.ConeGeometry(0.065, 1, 5).scale(1, 0.31, 1), C.beard, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.31, 0.04)))
  beard.add(strand(new THREE.ConeGeometry(0.032, 1, 4).scale(1, 0.22, 1), C.beardShade, new THREE.Vector3(0, -0.02, 0.014), new THREE.Vector3(0, -0.24, 0.058)))

  // Sous lui, une lueur verte : il ne touche pas le sol.
  const auraMat = new THREE.MeshBasicMaterial({ color: '#7dff8a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
  const aura = part(new THREE.CircleGeometry(0.2, 20), auraMat, 0, 0.006, 0)
  aura.rotation.x = -Math.PI / 2
  live.add(aura)
  const extent = new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.18), new THREE.Vector3(0.2, 0.92, 0.18))
  const phase = random() * 10
  // Au sol, l'ombre de la boule ; le volume de collision et de clic, c'est `extent`.
  const solid = new THREE.Group()
  solid.add(cylinder(0.11, 0.11, 0.004, lit('#13261a'), 0, 0.002, 0, 16))
  return {
    solid,
    live,
    extent,
    update(t) {
      // Un rire toutes les 11 s environ : les épaules sautillent, la tête part en arrière.
      const u = (t + phase) % 11
      const laugh = u < 1.4 ? Math.sin((u / 1.4) * Math.PI) : 0
      body.position.y = 0.075 + Math.sin(t * 1.1 + phase) * 0.025 + laugh * Math.abs(Math.sin(t * 16)) * 0.018
      body.rotation.y = Math.PI / 4 + Math.sin(t * 0.27 + phase) * 0.35
      head.rotation.x = -0.12 - laugh * 0.22 + Math.sin(t * 0.4 + phase) * 0.05
      beard.rotation.x = laugh * 0.15
      auraMat.opacity = 0.18 + 0.1 * Math.sin(t * 1.1 + phase)
      aura.scale.setScalar(1 - Math.sin(t * 1.1 + phase) * 0.12)
    },
  }
}

// ---------------------------------------------------------------- autour

/** La lunette de Bugenhagen : un tube de laiton sur trépied de bois, pointé vers la coupole. */
const brassTelescope: Builder = () => {
  const g = new THREE.Group()
  const wood = lit(C.wood), brass = lit(C.brass), brassDark = lit(C.brassDark)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    const leg = cylinder(0.014, 0.018, 0.62, wood, Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12, 6)
    leg.rotation.set(Math.sin(a) * -0.38, 0, Math.cos(a) * 0.38)
    g.add(leg)
  }
  g.add(cylinder(0.04, 0.04, 0.06, brassDark, 0, 0.6, 0, 10))
  const tube = new THREE.Group()
  tube.position.y = 0.66
  tube.rotation.x = 0.8
  tube.add(cylinder(0.042, 0.05, 0.62, brass, 0, 0.12, 0, 14))
  tube.add(cylinder(0.058, 0.058, 0.06, brassDark, 0, 0.42, 0, 14), cylinder(0.035, 0.035, 0.05, brassDark, 0, -0.2, 0, 10))
  tube.add(cylinder(0.018, 0.022, 0.08, lit('#2a2a2a'), 0, -0.25, 0, 8))
  tube.add(box(0.12, 0.012, 0.012, brassDark, 0, 0.0, 0))
  g.add(tube)
  return { solid: g }
}

/**
 * La bibliothèque du vieux sage, 1,1 de large : grimoires de toutes les couleurs, rouleaux de
 * cartes du ciel, et au sommet une sphère armillaire. Dos au mur (origine au centre, face +z).
 */
const starShelf: Builder = ({ random }) => {
  const g = new THREE.Group()
  const W = 1.1, D = 0.32, H = 1.5
  const wood = lit(C.wood), dark = lit(C.woodDark)
  g.add(box(W, H, 0.03, dark, 0, H / 2, -D / 2 + 0.015))
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) g.add(box(0.04, H, D, wood, x, H / 2, 0))
  const shelves = [0.04, 0.4, 0.76, 1.12, H - 0.02]
  for (const y of shelves) g.add(box(W, 0.035, D, wood, 0, y, 0))
  const spines = ['#7a2a24', '#2a4a7a', '#3a6a3a', '#8a6a2a', '#5a3a6a', '#2a2a2a', '#a8542a', '#c8b48a']
  for (let s = 0; s < 3; s++) {
    let x = -W / 2 + 0.06
    const y = shelves[s] + 0.018
    while (x < W / 2 - 0.1) {
      if (random() < 0.12) {
        // Une pile de rouleaux de cartes du ciel, couchés.
        for (let k = 0; k < 3; k++) {
          const roll = cylinder(0.025, 0.025, 0.24, lit('#e6d8b0'), x + 0.04 + (k % 2) * 0.05, y + 0.026 + Math.floor(k / 2) * 0.045, 0.02, 8)
          roll.rotation.x = Math.PI / 2
          g.add(roll)
        }
        x += 0.15
        continue
      }
      const w = 0.03 + random() * 0.035, h = 0.2 + random() * 0.12
      const lean = random() < 0.08 ? 0.25 : 0
      const b = box(w, h, 0.2 + random() * 0.04, lit(spines[Math.floor(random() * spines.length)]), x + w / 2, y + h / 2, 0.01)
      b.rotation.z = lean
      g.add(b)
      if (random() < 0.3) g.add(box(w + 0.002, 0.012, 0.18, lit(C.gold), x + w / 2, y + h * 0.75, 0.012))
      x += w + 0.004 + (lean ? 0.06 : 0)
    }
  }
  // Sur l'étagère du haut, un crâne de bête et un bocal ; au sommet, la sphère armillaire.
  g.add(sphere(0.06, lit('#e8dcc0'), 0.28, shelves[3] + 0.07, 0.02, 8), box(0.05, 0.03, 0.05, lit('#e8dcc0'), 0.28, shelves[3] + 0.03, 0.07))
  g.add(cylinder(0.05, 0.05, 0.14, lit('#5a7a6a'), -0.3, shelves[3] + 0.09, 0, 10))
  g.add(cylinder(0.05, 0.07, 0.04, lit(C.brassDark), 0, H + 0.02, 0, 10), cylinder(0.012, 0.012, 0.08, lit(C.brass), 0, H + 0.08, 0, 6))
  for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2], [0.4, 0.7]]) {
    const ring = mesh(new THREE.TorusGeometry(0.11, 0.006, 4, 24), lit(C.brass), 0, H + 0.2, 0)
    ring.rotation.set(rx, ry, 0)
    g.add(ring)
  }
  g.add(sphere(0.025, lit(C.brassDark), 0, H + 0.2, 0, 8))
  return { solid: g }
}

export const PLANETARIUM = {
  'planetarium-floor': planetariumFloor,
  'planetarium-projector': planetariumProjector,
  'planetarium-sky': planetariumSky,
  bugenhagen,
  'brass-telescope': brassTelescope,
  'star-shelf': starShelf,
} satisfies Record<string, Builder>
