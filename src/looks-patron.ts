import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { keepShared } from './dispose'
import { holoTime } from './furniture/kit'

/*
 * La combinaison Mécène, portée par ceux qui soutiennent le site sur Patreon : une tenue d'apparat
 * noire et or, à cape pourpre. Par-dessus la combinaison recolorée (cf. `patron` dans looks.ts) :
 * mantelet et cape doublée, ourlés d'or ; épaulettes ; plastron cerclé d'or et son médaillon, dont
 * la pierre bat doucement ; ceinture à boucle, pan de tabard ; brassards et genouillères ; sur le
 * casque, une crête, un cadre de visière, une pierre au front et deux ailes.
 *
 * Mêmes repères que l'équipement de Kael (cf. looks-scavengers.ts) : le torse va de y = 0 à 0,17
 * (devant : z = 0,11), un bras de x = 0 à ±0,28, une jambe de y = 0 à -0,18.
 */

const P = {
  gold: '#d9a73a',
  shell: '#1a1820',
  crimson: '#7a1024',
  lining: '#3a0912',
  gem: '#fff3c4',
}

type PatronMats = Record<'gold' | 'shell' | 'crimson' | 'lining' | 'gem' | 'pulse', THREE.Material>

let patronMaterials: PatronMats | null = null
function mats(): PatronMats {
  if (patronMaterials) return patronMaterials
  // La pierre du médaillon bat comme un cœur, lentement (un appel de dessin à part : elle n'est pas cuite).
  const pulse = new THREE.MeshBasicMaterial({ color: P.gem, toneMapped: false })
  pulse.customProgramCacheKey = () => 'patron-gem'
  pulse.onBeforeCompile = (shader) => {
    shader.uniforms.uHoloTime = holoTime
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHoloTime;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= 0.75 + 0.45 * pow(0.5 + 0.5 * sin(uHoloTime * 2.2), 3.0);')
  }
  patronMaterials = {
    // L'or brille : un reflet clair, et un fond chaud pour qu'il ne s'éteigne pas dans les coins sombres.
    gold: new THREE.MeshPhongMaterial({ color: P.gold, specular: '#fff1c0', shininess: 70, emissive: '#3a2400' }),
    shell: new THREE.MeshLambertMaterial({ color: P.shell }),
    crimson: new THREE.MeshLambertMaterial({ color: P.crimson }),
    lining: new THREE.MeshLambertMaterial({ color: P.lining }),
    gem: new THREE.MeshBasicMaterial({ color: P.gem }),
    pulse,
  }
  for (const m of Object.values(patronMaterials)) keepShared(m)
  return patronMaterials
}

const rbox = (w: number, h: number, d: number, m: THREE.Material, r = 0.01) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.999), m)
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z)
  return o
}

/** Une pierre taillée (octaèdre), qui regarde vers +z. */
const gem = (r: number, m: THREE.Material) => new THREE.Mesh(new THREE.OctahedronGeometry(r), m)

/** Trapèze plat, haut de `top`, bas de `bottom`, qui descend de `h` sous son origine (épaisseur vers +z). */
function trapezoid(top: number, bottom: number, h: number, depth: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  s.moveTo(-top / 2, 0)
  s.lineTo(top / 2, 0)
  s.lineTo(bottom / 2, -h)
  s.lineTo(-bottom / 2, -h)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
}

/** Le corps : mantelet et cape, plastron et médaillon, ceinture, épaulettes, brassards, genouillères. */
export function addPatronGear(root: THREE.Object3D) {
  const m = mats()
  const torso = root.getObjectByName('torso')
  if (torso) {
    // Le plastron, cerclé d'or, et le médaillon.
    torso.add(at(rbox(0.215, 0.095, 0.02, m.gold, 0.012), 0, 0.112, 0.104))
    torso.add(at(rbox(0.19, 0.075, 0.024, m.shell, 0.01), 0, 0.112, 0.11))
    const medal = at(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 8), m.gold), 0, 0.112, 0.124)
    medal.rotation.set(Math.PI / 2, Math.PI / 8, 0)
    torso.add(medal)
    torso.add(at(gem(0.02, m.pulse), 0, 0.112, 0.132))
    // Deux filets d'or du plastron à la ceinture.
    for (const s of [-1, 1]) torso.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.006), m.gold), s * 0.07, 0.045, 0.112))
    // La ceinture, sa boucle et sa pierre ; dessous, le pan du tabard ourlé d'or.
    torso.add(at(rbox(0.3, 0.034, 0.27, m.shell, 0.008), 0, 0.012, 0))
    torso.add(at(rbox(0.302, 0.008, 0.272, m.gold, 0.003), 0, 0.027, 0))
    torso.add(at(rbox(0.06, 0.044, 0.014, m.gold, 0.008), 0, 0.012, 0.137))
    torso.add(at(gem(0.012, m.gem), 0, 0.012, 0.145))
    const tabard = at(new THREE.Mesh(trapezoid(0.085, 0.07, 0.07, 0.01), m.crimson), 0, -0.004, 0.13)
    torso.add(tabard)
    torso.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.012, 0.012), m.gold), 0, -0.07, 0.135))
    // Le mantelet sur les épaules, ourlé d'or, et ses deux agrafes devant.
    torso.add(at(rbox(0.32, 0.03, 0.285, m.crimson, 0.012), 0, 0.176, 0))
    torso.add(at(rbox(0.326, 0.01, 0.291, m.gold, 0.004), 0, 0.16, 0))
    for (const s of [-1, 1]) {
      const clasp = at(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10), m.gold), s * 0.1, 0.168, 0.145)
      clasp.rotation.x = Math.PI / 2
      torso.add(clasp)
    }
    // La cape : pourpre dehors, lie-de-vin dedans, ourlée d'or, un peu écartée du dos.
    const cape = new THREE.Group()
    cape.add(at(new THREE.Mesh(trapezoid(0.3, 0.38, 0.31, 0.014), m.crimson), 0, 0, -0.014))
    cape.add(at(new THREE.Mesh(trapezoid(0.29, 0.37, 0.3, 0.004), m.lining), 0, -0.004, 0.001))
    cape.add(at(rbox(0.385, 0.02, 0.022, m.gold, 0.006), 0, -0.305, -0.007))
    for (const s of [-1, 1]) {
      const edge = at(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.31, 0.02), m.gold), s * 0.17, -0.155, -0.007)
      edge.rotation.z = s * Math.atan2(0.04, 0.31)
      cape.add(edge)
    }
    // Au dos, un losange d'or et sa pierre.
    const badge = at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 4), m.gold), 0, -0.15, -0.019)
    badge.rotation.x = Math.PI / 2
    cape.add(badge)
    cape.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 4), m.crimson), 0, -0.15, -0.021))
    cape.add(at(gem(0.018, m.gem), 0, -0.15, -0.026))
    cape.position.set(0, 0.17, -0.142)
    cape.rotation.x = 0.16
    torso.add(cape)
  }
  // Épaulettes : une plaque noire sur un socle d'or ; brassards d'or aux poignets.
  for (const [side, s] of [['arm-left', 1], ['arm-right', -1]] as const) {
    const arm = root.getObjectByName(side)
    if (!arm) continue
    arm.add(at(rbox(0.115, 0.026, 0.165, m.gold, 0.01), s * 0.058, 0.068, 0))
    arm.add(at(rbox(0.095, 0.03, 0.14, m.shell, 0.012), s * 0.054, 0.082, 0))
    arm.add(at(gem(0.012, m.gem), s * 0.054, 0.1, 0))
    arm.add(at(rbox(0.032, 0.085, 0.112, m.gold, 0.01), s * 0.17, 0.03, 0))
  }
  for (const side of ['leg-left', 'leg-right']) {
    const leg = root.getObjectByName(side)
    if (leg) leg.add(at(rbox(0.085, 0.045, 0.02, m.gold, 0.01), 0, -0.088, 0.096))
  }
}

/**
 * Le casque : crête d'or, cadre de la visière, pierre au front, deux ailes sur les côtés, et le col
 * d'or. `center` : le centre de la coque dans le repère de la tête ; `w`, `h`, `d` : sa taille ;
 * `visorY` : la hauteur de la visière.
 */
export function addPatronHelmet(head: THREE.Object3D, center: THREE.Vector3, w: number, h: number, d: number, visorY: number) {
  const m = mats()
  const front = center.z + d / 2
  const top = center.y + h / 2
  head.add(at(rbox(w * 0.88, h * 0.56, 0.05, m.gold, 0.025), center.x, visorY, front - 0.02))
  // Bandeau d'or au bas de la coque.
  head.add(at(rbox(w * 1.015, h * 0.055, d * 1.015, m.gold, 0.02), center.x, center.y - h * 0.445, center.z))
  // La crête, façon centurion : un socle d'or, un plumet pourpre qui retombe vers l'arrière.
  head.add(at(rbox(0.06, 0.03, d * 0.86, m.gold, 0.012), center.x, top + 0.006, center.z - d * 0.02))
  const plumes = 8
  for (let i = 0; i < plumes; i++) {
    const t = i / (plumes - 1)
    const z = center.z + d * (0.34 - t * 0.74)
    const ph = 0.075 - t * 0.03
    head.add(at(rbox(0.05, ph, d * 0.16, m.crimson, 0.014), center.x, top + 0.018 + ph / 2 - t * t * 0.02, z))
  }
  head.add(at(gem(0.026, m.gem), center.x, center.y + h * 0.36, front + 0.006))
  // Les ailes : trois rémiges balayées vers l'arrière (le dessin va vers +x, tourné vers -z).
  const feather = new THREE.Shape()
  for (const [i, [u, v]] of [[0, -0.02], [0.01, 0.04], [0.07, 0.11], [0.2, 0.155], [0.12, 0.095], [0.19, 0.095], [0.11, 0.05], [0.16, 0.035], [0.07, -0.02]].entries()) {
    if (i === 0) feather.moveTo(u, v)
    else feather.lineTo(u, v)
  }
  feather.closePath()
  const wing = new THREE.ExtrudeGeometry(feather, { depth: 0.014, bevelEnabled: false }).translate(0, 0, -0.007).rotateY(Math.PI / 2)
  for (const s of [-1, 1]) {
    const o = at(new THREE.Mesh(wing, m.gold), center.x + s * (w / 2 + 0.006), center.y + h * 0.08, center.z + d * 0.22)
    o.scale.setScalar(1.3)
    head.add(o)
  }
}

/** Le col d'or, à la base du casque. */
export function patronCollar(): THREE.Material {
  return mats().gold
}
