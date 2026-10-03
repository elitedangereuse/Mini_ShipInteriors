import * as THREE from 'three'
import { LEAVES } from './cozy'
import { box, cylinder, ED_ORANGE, glow, lit, mat, mesh, type Builder } from './kit'
import { eliteMonument } from './monument'

/*
 * Le hall de la salle commune, comme le concourse d'une station Coriolis : au milieu, l'îlot du
 * hall, une jardinière ronde ceinte d'une banquette, sous le monument du vaisseau (cf. monument.ts).
 */

/** Rayon de la banquette (l'îlot fait 2 × 2). */
const R = 0.98

/** Anneau plein (vue de profil : `profile`, en rayon et hauteur), tourné autour de l'axe y. */
function ring(profile: [number, number][], material: THREE.Material, seg = 40): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), material)
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
 * projecteur tient en lévitation, au-dessus des têtes, le blason « MINI SHIP INTERIORS » façon
 * Elite Dangerous. On s'assoit sur la banquette, dos aux plantes.
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
  // Le projecteur, et le monument qu'il tient en lévitation, face aux portes (à l'est) : la
  // caméra tournant par quarts de tour à 45° de ses axes, on le voit de trois quarts, de face ou de
  // dos, dans toutes les vues ; il ne fait que monter et descendre d'un rien.
  g.add(cylinder(0.13, 0.17, 0.5, mat.steel, 0, 0.75, 0, 16))
  const lens = mesh(new THREE.TorusGeometry(0.13, 0.016, 6, 24), mat.lamp, 0, 1.0, 0)
  lens.rotation.x = Math.PI / 2
  g.add(lens)
  const monument = eliteMonument()
  monument.position.y = 1.03
  monument.rotation.y = Math.PI / 2
  monument.scale.setScalar(1.5)
  live.add(monument)
  return {
    solid: g,
    live,
    update: (t) => {
      monument.position.y = 1.03 + Math.sin(t * 0.9) * 0.006
    },
  }
}

export const CONCOURSE = {
  'concourse-planter': concoursePlanter,
} satisfies Record<string, Builder>
