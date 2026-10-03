import * as THREE from 'three'
import { LEAVES } from './cozy'
import { box, cylinder, ED_ORANGE, glow, holoMaterial, lit, mat, mesh, part, pointCloud, type Builder } from './kit'

/*
 * Le hall de la salle commune, comme le concourse d'une station Coriolis : au milieu, l'îlot du
 * hall, une jardinière ronde ceinte d'une banquette, sous l'hologramme de la galaxie.
 */

/** Rayon de la banquette (l'îlot fait 2 × 2). */
const R = 0.98

/** Anneau plein (vue de profil : `profile`, en rayon et hauteur), tourné autour de l'axe y. */
function ring(profile: [number, number][], material: THREE.Material, seg = 40): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), material)
}

/**
 * La galaxie de l'hologramme, de rayon 1 : un bulbe doré, deux bras qui font un tour en
 * s'éloignant, un voile d'étoiles entre eux ; 4 000 étoiles, le même tirage chez tous.
 */
function galaxy(random: () => number): THREE.Points {
  const N = 4000
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N)
  const core = new THREE.Color('#ffe2a8'), arm = new THREE.Color('#9fc2ff'), young = new THREE.Color('#ff8a3a'), c = new THREE.Color()
  const gauss = () => (random() + random() + random() - 1.5) / 1.5
  for (let i = 0; i < N; i++) {
    let x: number, y: number, z: number
    if (i < N * 0.18) {
      // Le bulbe, un peu allongé (la barre).
      x = gauss() * 0.2
      z = gauss() * 0.1
      y = gauss() * 0.05
      c.copy(core)
      size[i] = 0.03 + random() * 0.03
    } else if (i < N * 0.85) {
      // Les bras : spirale d'un tour, de plus en plus lâche vers le bord.
      const r = 0.1 + Math.pow(random(), 1.3) * 0.9
      const a = (i % 2) * Math.PI + r * Math.PI * 2 + gauss() * (0.12 + r * 0.18)
      const spread = 1 + gauss() * 0.06
      x = Math.cos(a) * r * spread
      z = Math.sin(a) * r * spread
      y = gauss() * 0.025
      c.copy(arm).lerp(core, Math.max(0, 0.6 - r))
      if (random() < 0.12) c.copy(young)
      size[i] = 0.018 + random() * 0.03
    } else {
      // Le voile d'étoiles du disque.
      const r = Math.sqrt(random()) * 1.05
      const a = random() * Math.PI * 2
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      y = gauss() * 0.04
      c.copy(arm).lerp(core, 0.3).multiplyScalar(0.6)
      size[i] = 0.012 + random() * 0.016
    }
    pos.set([x, y, z], i * 3)
    col.set([c.r, c.g, c.b], i * 3)
  }
  return pointCloud(pos, col, size)
}

/** Lueur du disque de la galaxie : un halo doré au centre, bleuté vers le bord, en fondu. */
function galaxyHalo(): THREE.Mesh {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255, 220, 160, 0.9)')
  grad.addColorStop(0.18, 'rgba(255, 170, 90, 0.35)')
  grad.addColorStop(0.55, 'rgba(110, 150, 255, 0.12)')
  grad.addColorStop(1, 'rgba(60, 90, 200, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const map = new THREE.CanvasTexture(cv)
  map.colorSpace = THREE.SRGBColorSpace
  const halo = part(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
  halo.rotation.x = -Math.PI / 2
  return halo
}

/** Touffe de fougère : des frondes qui retombent tout autour de (x, z), sur la terre de la jardinière. */
function fern(g: THREE.Group, random: () => number, x: number, z: number, color: string) {
  const n = 7
  for (let i = 0; i < n; i++) {
    const frond = new THREE.Group()
    frond.position.set(x, 0.53, z)
    frond.rotation.y = (i / n) * Math.PI * 2 + random() * 0.4
    const blade = new THREE.Group()
    blade.rotation.x = -(0.5 + random() * 0.4)
    blade.add(box(0.06, 0.012, 0.26 + random() * 0.08, lit(color), 0, 0, 0.13))
    frond.add(blade)
    g.add(frond)
  }
}

/**
 * L'îlot du hall (2 × 2) : une banquette ronde, ses coussins sarcelle et son liseré orange, autour
 * d'une jardinière (fougères, buissons fleuris, grandes feuilles), au milieu de laquelle un
 * projecteur fait tourner la galaxie au-dessus des têtes. On s'assoit sur la banquette, dos aux
 * plantes.
 */
const concoursePlanter: Builder = ({ random }) => {
  const g = new THREE.Group()
  const live = new THREE.Group()
  // Socle et banquette.
  g.add(ring([[0, 0], [R + 0.04, 0], [R + 0.04, 0.03], [0, 0.03]], mat.steelDark))
  g.add(ring([[0.7, 0.03], [R, 0.03], [R, 0.22], [0.7, 0.22]], lit('#3a414f')))
  g.add(ring([[0.7, 0.22], [R + 0.01, 0.22], [R + 0.01, 0.27], [R - 0.02, 0.29], [0.7, 0.29]], lit('#2f7f86')))
  g.add(ring([[R + 0.005, 0.08], [R + 0.012, 0.08], [R + 0.012, 0.11], [R + 0.005, 0.11]], glow(ED_ORANGE)))
  // La jardinière : un muret, la terre, un liseré lumineux.
  g.add(ring([[0.5, 0.03], [0.7, 0.03], [0.7, 0.52], [0.66, 0.55], [0.5, 0.55]], lit('#4a505c')))
  g.add(ring([[0.701, 0.44], [0.708, 0.44], [0.708, 0.47], [0.701, 0.47]], glow('#8ff0ff')))
  g.add(cylinder(0.6, 0.6, 0.02, lit('#3a2a1e'), 0, 0.5, 0, 28))
  // Fougères tout autour, des buissons fleuris entre elles.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    fern(g, random, Math.cos(a) * 0.46, Math.sin(a) * 0.46, LEAVES[i % 4])
    const b = a + Math.PI / 7
    const bush = mesh(new THREE.IcosahedronGeometry(0.09, 1), lit(LEAVES[(i + 2) % 4]), Math.cos(b) * 0.5, 0.58, Math.sin(b) * 0.5)
    bush.scale.y = 0.7
    g.add(bush)
    g.add(mesh(new THREE.IcosahedronGeometry(0.028, 0), lit(['#ff8fb1', '#ffd36b', '#c9a2ff'][i % 3]), Math.cos(b) * 0.52, 0.65, Math.sin(b) * 0.52))
  }
  // Au pied du projecteur, des plantes plus hautes : des tiges et leurs grandes feuilles.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(a) * 0.25, z = Math.sin(a) * 0.25
    g.add(cylinder(0.012, 0.016, 0.42, lit('#4f7a3a'), x, 0.72, z, 5))
    const leaf = mesh(new THREE.SphereGeometry(0.11, 8, 5), lit(LEAVES[k % 4]), x * 1.25, 0.95, z * 1.25)
    leaf.scale.set(1, 0.32, 0.7)
    leaf.rotation.y = -a
    g.add(leaf)
  }
  // Le projecteur, et la galaxie au-dessus des têtes.
  g.add(cylinder(0.13, 0.17, 0.5, mat.steel, 0, 0.75, 0, 16))
  const lens = mesh(new THREE.TorusGeometry(0.13, 0.016, 6, 24), mat.lamp, 0, 1.0, 0)
  lens.rotation.x = Math.PI / 2
  g.add(lens)
  live.add(part(new THREE.CylinderGeometry(0.62, 0.12, 0.42, 28, 1, true), holoMaterial(null, ED_ORANGE, 0.16, 1), 0, 1.22, 0))
  const disc = new THREE.Group()
  disc.position.y = 1.5
  disc.rotation.x = 0.3
  disc.scale.setScalar(0.85)
  disc.add(galaxyHalo(), galaxy(random))
  // Le cœur, qui luit.
  const core = part(new THREE.SphereGeometry(0.07, 12, 8), glow('#ffe3b0'))
  core.scale.y = 0.45
  disc.add(core)
  live.add(disc)
  return {
    solid: g,
    live,
    update: (t) => {
      disc.rotation.y = t * 0.05
    },
  }
}

export const CONCOURSE = {
  'concourse-planter': concoursePlanter,
} satisfies Record<string, Builder>
