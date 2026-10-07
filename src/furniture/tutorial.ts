import * as THREE from 'three'
import { beamMaterial, box, cylinder, drawnTexture, ellipseSegments, glow, holoMaterial, holoTime, lit, panelTexture, part, type Builder } from './kit'

/*
 * Le simulateur d'accueil des nouveaux venus (cf. src/tutorial.ts) : une salle holographique.
 * Grille cyan au sol, panneaux de consignes accrochés aux murs, et le téléporteur qui dépose la
 * recrue sur le pont principal, sa leçon finie.
 */

const CYAN = '#39d0ff'

/**
 * Grille holographique posée au sol d'une salle : des lignes cyan à chaque tuile, plus vives en
 * bordure. `label` : « largeur x profondeur » (en tuiles).
 */
const simGrid: Builder = ({ label = '4x4' }) => {
  const [w, d] = label.split('x').map(Number)
  const px = 64
  const texture = drawnTexture(w * px, d * px, (g) => {
    g.strokeStyle = CYAN
    g.lineWidth = 2
    g.globalAlpha = 0.32
    for (let x = 0; x <= w; x++) {
      g.beginPath()
      g.moveTo(x * px, 0)
      g.lineTo(x * px, d * px)
      g.stroke()
    }
    for (let z = 0; z <= d; z++) {
      g.beginPath()
      g.moveTo(0, z * px)
      g.lineTo(w * px, z * px)
      g.stroke()
    }
    g.globalAlpha = 0.85
    g.lineWidth = 5
    g.strokeRect(3, 3, w * px - 6, d * px - 6)
  })
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 })
  const plane = part(new THREE.PlaneGeometry(w, d), material, 0, 0.008, 0)
  plane.rotation.x = -Math.PI / 2
  const live = new THREE.Group()
  live.add(plane)
  return {
    live,
    update: (t) => {
      material.opacity = 0.75 + Math.sin(t * 1.4) * 0.15
    },
  }
}

/**
 * Panneau de consignes holographique, accroché au mur (dos au mur, face à +z) : un écran cyan à la
 * façon d'Elite. `label` : « TITRE|ligne|ligne… ».
 */
const simSign: Builder = ({ label = 'SIMULATEUR|Bienvenue à bord' }) => {
  const panel = part(new THREE.PlaneGeometry(0.86, 0.54), holoMaterial(panelTexture(label), CYAN, 0.92), 0, 0.98, 0.04)
  const live = new THREE.Group()
  live.add(panel, part(new THREE.BoxGeometry(0.62, 0.02, 0.03), glow(CYAN), 0, 0.68, 0.03))
  return {
    live,
    update: (t) => {
      panel.position.y = 0.98 + Math.sin(t * 1.1) * 0.006
    },
  }
}

/**
 * Le téléporteur : un socle rond à fleur de sol, cerclé de lumière, où tournent deux anneaux
 * holographiques sous une colonne de lumière. Il s'éveille quand la dernière leçon est finie (cf.
 * src/tutorial.ts, qui en règle l'éclat).
 */
const simTeleporter: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.62, 0.66, 0.06, lit('#2a2e36', 'metal'), 0, 0.03, 0, 40))
  g.add(cylinder(0.5, 0.5, 0.012, lit('#3c4350', 'metal'), 0, 0.066, 0, 40))
  // Plots lumineux tout autour.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    g.add(box(0.07, 0.02, 0.07, glow(CYAN), Math.cos(a) * 0.57, 0.068, Math.sin(a) * 0.57))
  }
  const live = new THREE.Group()
  const ring = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(ellipseSegments(0.5, 0.5, 0, 56)),
    new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9, depthWrite: false }),
  )
  ring.position.y = 0.08
  const halos = [0.32, 0.72].map((y, i) => {
    const m = part(new THREE.TorusGeometry(0.42 - i * 0.06, 0.012, 6, 48), holoMaterial(null, CYAN, 0.8), 0, y, 0)
    m.rotation.x = Math.PI / 2
    return m
  })
  const beam = beamMaterial()
  beam.uniforms.uColor.value.set(CYAN)
  const column = part(new THREE.CylinderGeometry(0.42, 0.46, 1.6, 32, 1, true), beam, 0, 0.88, 0)
  live.add(ring, column, ...halos)
  return {
    solid: g,
    live,
    update: (t) => {
      beam.uniforms.uTime.value = holoTime.value
      halos.forEach((h, i) => {
        h.position.y = 0.2 + (((t * 0.35 + i * 0.5) % 1) * 1.1)
        h.rotation.z = t * (i ? -0.8 : 0.6)
      })
    },
  }
}

export const TUTORIAL = {
  'sim-grid': simGrid,
  'sim-sign': simSign,
  'sim-teleporter': simTeleporter,
}
