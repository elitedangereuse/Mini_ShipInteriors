import * as THREE from 'three'
import { Avatar } from '../avatar'
import { withoutLightField } from '../lighting/field'
import type { CharacterId } from '../../shared/arena.js'
import { CHARACTERS } from './characters'

/*
 * Les portraits des personnages, pour leur fiche au terminal : la tête et le haut des épaules de
 * chacun, de trois quarts, au repos, sur fond transparent (la fiche met le fond, à sa couleur), avec
 * l'expression qui lui va. Tous sont rendus d'un coup, à la première demande, dans un petit rendu
 * hors écran aussitôt libéré (comme ceux des poissons, cf. fishing/portraits.ts) : leurs modèles se
 * chargent d'abord, la fiche montre leur pastille en attendant.
 */

const SIZE = 256
/** L'expression de chacun (cf. FaceControl), pour ceux qui ont un visage de Mini Character. */
const MOOD: Partial<Record<CharacterId, string>> = { marcel: 'gr', nico: 'wi', betty: 'sm', capucine: 'gr' }

const done = new Map<CharacterId, string>()
let loading: Promise<void> | null = null

/** Le portrait de `id` (une image PNG en data URL), s'il est prêt ; sinon null (cf. loadPortraits). */
export function portrait(id: CharacterId): string | null {
  return done.get(id) ?? null
}

/** Rend les six portraits (une seule fois) ; la promesse se tient quand ils sont prêts, ou ont échoué. */
export function loadPortraits(): Promise<void> {
  loading ??= renderAll().catch(() => {})
  return loading
}

async function renderAll() {
  // Les modèles d'abord : le rendu, lui, se fait d'une traite.
  const rigs = await Promise.all(CHARACTERS.map((c) => c.rig().then((r) => ({ c, r })).catch(() => null)))
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  try {
    renderer.setPixelRatio(1)
    renderer.setSize(SIZE, SIZE, false)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#ffffff', '#4a5468', 1.7))
    const key = new THREE.DirectionalLight('#fff4e0', 2.1)
    key.position.set(1.5, 2.5, 3)
    scene.add(key)
    // Un liseré de lumière à sa couleur, dans son dos : il se détache du fond.
    const rim = new THREE.DirectionalLight('#ffffff', 1.6)
    rim.position.set(-2.5, 1.5, -2.5)
    scene.add(rim)
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20)
    for (const it of rigs) {
      if (!it) continue
      const { c, r } = it
      const avatar = new Avatar(r)
      // Au repos, un instant après le début de l'animation : les bras le long du corps.
      avatar.update(0.4)
      scene.add(avatar.root)
      avatar.root.updateMatrixWorld(true)
      const mood = MOOD[c.id]
      if (mood) r.face?.show(mood)
      rim.color.set(c.color)
      const face = faceBox(avatar.root)
      const center = face.getCenter(new THREE.Vector3())
      const size = face.getSize(new THREE.Vector3())
      // De trois quarts, un peu de haut : le visage (+z) regarde à gauche de l'image.
      const half = Math.max(size.y, size.x) * 0.78
      const dist = half / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      camera.position.copy(center).add(new THREE.Vector3(0.42, 0.14, 1).normalize().multiplyScalar(dist))
      camera.lookAt(center)
      camera.updateMatrixWorld(true)
      withoutLightField(() => renderer.render(scene, camera))
      done.set(c.id, renderer.domElement.toDataURL('image/png'))
      scene.remove(avatar.root)
    }
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

const _v = new THREE.Vector3()

/**
 * Le cadre du visage : la tête (le maillage `head-mesh` des Mini Characters, la pièce `head` des
 * Blocky), un peu de cou dessous ; sans tête trouvée, le haut du personnage. Un chapeau trop haut
 * (la toque de Marcel) n'y entre qu'à moitié : c'est le visage qu'on regarde.
 */
function faceBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  const head = root.getObjectByName('head-mesh') ?? root.getObjectByName('head')
  const whole = new THREE.Box3().setFromObject(root, true)
  if (head && (head as THREE.Mesh).isMesh) box.setFromObject(head, true)
  else if (head) {
    // Un os : la tête part de là et monte jusqu'en haut du personnage.
    head.getWorldPosition(_v)
    box.set(new THREE.Vector3(whole.min.x, _v.y, whole.min.z), whole.max.clone())
  } else box.set(new THREE.Vector3(whole.min.x, whole.max.y - (whole.max.y - whole.min.y) * 0.45, whole.min.z), whole.max.clone())
  // Le cou et le haut des épaules, sous la tête ; pas plus d'une demi-tête de chapeau.
  const tall = box.max.y - box.min.y
  box.min.y -= tall * 0.22
  box.max.y = Math.min(box.max.y, whole.max.y, box.min.y + tall * 1.35)
  return box
}
