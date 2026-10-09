import * as THREE from 'three'
import { BAYER } from './fade'
import { drawnTexture } from './furniture/kit'

/*
 * Couvercle d'une pièce réservée (le labo du L.J.P.C., le sanctuaire de la Voie, le Zorb, Chez
 * Jacques), tant qu'on n'y a pas accès : une plaque de blindage fine, posée au ras du haut des
 * murs. Des tôles jointives et rivetées, un liseré lumineux à la couleur de la pièce, qui
 * respire, et un cadenas en son centre. Sans couleur (`glow`), la plaque reste nue et se fond
 * dans le noir : le sanctuaire de la Voie ne se signale pas.
 *
 * La plaque se troue autour du joueur qui passe derrière elle, tramée comme les murs (cf. fade.ts),
 * mais là seulement où le regard retombe hors de la pièce : on voit le joueur et la coursive, jamais
 * le sol de la pièce (son mobilier, lui, n'est pas dessiné tant qu'elle est fermée, cf. Deck.cull).
 * Quand la pièce s'ouvre, les tôles se défont une à une, du cadenas vers les bords.
 */

/** Épaisseur de la plaque, et hauteur de son dessous (le haut des murs). */
const THICKNESS = 0.03
const WALL_TOP = 1.06
/** Retrait du liseré par rapport au bord, et sa largeur. */
const INSET = 0.24
const STRIP = 0.035
/** Pixels par tuile de la texture des tôles. */
const PX = 64

/** Taille du joueur, et rayon du trou autour de lui : plein jusqu'à `HOLE_IN`, refermé à `HOLE_OUT`. */
const BODY = 0.9
const HOLE_IN = 0.4
const HOLE_OUT = 0.95
/** Ce qu'il reste de la plaque au cœur du trou (comme un mur tramé, cf. merge.ts). */
const HOLE_FADE = 0.22
/** Part de l'ouverture que met une tôle à se défaire : les autres suivent, de proche en proche. */
const SPREAD = 0.4
/** Part du temps d'ouverture où seul le cadenas réagit, avant que les tôles ne partent. */
const UNLOCK = 0.16

interface CoverUniforms {
  /** Pieds du joueur (monde), et la force du trou (0 : plaque pleine). */
  uHoleFocus: { value: THREE.Vector3 }
  uHoleOn: { value: number }
  /** Centre de la pièce (x, z, monde) et demi-côtés de son sol, entre les murs. */
  uHoleRoom: { value: THREE.Vector4 }
  uHoleFloor: { value: number }
  /** Ouverture : de 0 (plaque entière) à 1 (toutes les tôles défaites), et la couleur de leur bord. */
  uReveal: { value: number }
  uRevealGlow: { value: THREE.Color }
}

/**
 * Trou autour du joueur et ouverture tôle par tôle, pour tous les matériaux d'un couvercle. Sans
 * champ de lumière (cf. lighting/field.ts).
 * @param wall épaisseur des murs que coiffe la plaque
 */
function covering<M extends THREE.Material>(material: M, uniforms: CoverUniforms, wall: number): M {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vCoverWorld;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vCoverWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vCoverWorld;
  uniform vec3 uHoleFocus;
  uniform float uHoleOn;
  uniform vec4 uHoleRoom;
  uniform float uHoleFloor;
  uniform float uReveal;
  uniform vec3 uRevealGlow;
  ${BAYER}
  float coverHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  void main() {
    float coverFade = 1.0;
    float coverRim = 0.0;
    if (uHoleOn > 0.0) {
      vec3 ray = isOrthographic ? normalize(vec3(-viewMatrix[0][2], -viewMatrix[1][2], -viewMatrix[2][2])) : normalize(vCoverWorld - cameraPosition);
      // Le point du joueur (des pieds à la tête) le plus proche du regard qui traverse la plaque ici.
      vec3 w = vCoverWorld - uHoleFocus;
      float b = ray.y * ${BODY.toFixed(2)};
      float s = clamp((${BODY.toFixed(2)} * w.y - b * dot(ray, w)) / max(${(BODY * BODY).toFixed(4)} - b * b, 1e-4), 0.0, 1.0);
      vec3 q = uHoleFocus + vec3(0.0, s * ${BODY.toFixed(2)}, 0.0) - vCoverWorld;
      float along = dot(q, ray);
      float hole = (1.0 - smoothstep(${HOLE_IN.toFixed(2)}, ${HOLE_OUT.toFixed(2)}, length(q - along * ray))) * step(0.05, along) * uHoleOn;
      // Là où ce regard retombe sur le sol de la pièce, la plaque reste pleine.
      vec3 ground = vCoverWorld + ray * ((uHoleFloor - vCoverWorld.y) / min(ray.y, -1e-3));
      vec2 inside = uHoleRoom.zw - abs(ground.xz - uHoleRoom.xy);
      hole *= 1.0 - smoothstep(0.0, 0.12, min(inside.x, inside.y));
      coverFade = mix(1.0, ${HOLE_FADE.toFixed(2)}, hole);
    }
    if (uReveal > 0.0) {
      // Une tôle par tuile : elle s'embrase, puis se rétracte vers son centre. Le cadenas d'abord, les coins en dernier.
      // Le débord de la plaque sur les murs part avec la tôle du bord.
      vec2 reach = max(uHoleRoom.zw + ${(wall / 2 - 0.5).toFixed(3)}, 0.0);
      vec2 tile = clamp(floor(vCoverWorld.xz + 0.5), uHoleRoom.xy - reach, uHoleRoom.xy + reach);
      float rank = length((tile - uHoleRoom.xy) / max(reach, 0.5)) / 1.4142 * 0.88 + coverHash(tile) * 0.12;
      float k = clamp((uReveal * ${(1 + SPREAD).toFixed(2)} - rank) / ${SPREAD.toFixed(2)}, 0.0, 1.0);
      vec2 across = abs(vCoverWorld.xz - tile) * 2.0;
      float edge = 1.0 - k * k * (3.0 - 2.0 * k) * 1.2;
      float m = min(max(across.x, across.y), 1.0);
      if (m > edge) discard;
      coverRim = (smoothstep(edge - 0.28, edge, m) + 0.22 * sin(k * 3.1416)) * step(0.001, k);
      coverFade *= 1.0 - smoothstep(0.55, 1.0, k) * 0.7;
    }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
    if (coverFade < 0.999 && coverFade < bayer4(gl_FragCoord.xy)) discard;`)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n    gl_FragColor.rgb += uRevealGlow * coverRim;')
  }
  material.customProgramCacheKey = () => `room-cover|${wall}`
  return material
}

/** Couvercle d'une pièce réservée, et ce qui l'anime. */
export interface RoomCover {
  cover: THREE.Group
  /** Le liseré respire (`t` : temps écoulé). */
  update: (t: number) => void
  /** Troue la plaque autour du joueur (`focus` : ses pieds, en coordonnées monde), ou la referme (null). */
  pierce: (focus: THREE.Vector3 | null) => void
  /** Avancement de l'ouverture, de 0 (fermé) à 1 (plaque défaite). */
  reveal: (k: number) => void
}

/** Tôles de blindage : un joint par tuile, des rivets aux croisements, un métal brossé, sombre. */
function platingTexture(w: number, d: number, tint: THREE.Color): THREE.CanvasTexture {
  const scale = Math.min(1, 1024 / (Math.max(w, d) * PX))
  const px = PX * scale
  return drawnTexture(Math.ceil(w * px), Math.ceil(d * px), (g) => {
    const W = g.canvas.width, H = g.canvas.height
    const shade = (k: number) => `#${tint.clone().multiplyScalar(k).getHexString()}`
    g.fillStyle = shade(1)
    g.fillRect(0, 0, W, H)
    // Métal brossé : de fines stries, plus claires ou plus sombres.
    for (let i = 0; i < W * 1.5; i++) {
      g.fillStyle = shade(0.75 + ((i * 7919) % 100) / 180)
      g.globalAlpha = 0.22
      g.fillRect(0, ((i * 104729) % (H * 10)) / 10, W, 1)
    }
    g.globalAlpha = 1
    // Un joint tous les deux mètres, décalé d'une rangée sur l'autre, et ses rivets.
    const m = px * 0.15
    g.strokeStyle = shade(0.45)
    g.lineWidth = Math.max(1, px * 0.035)
    g.fillStyle = shade(1.7)
    for (let row = 0, z = m; z < H; z += px * 2, row++) {
      g.beginPath()
      g.moveTo(0, z)
      g.lineTo(W, z)
      g.stroke()
      for (let x = m + (row % 2) * px; x < W; x += px * 2) {
        g.beginPath()
        g.moveTo(x, z)
        g.lineTo(x, Math.min(H, z + px * 2))
        g.stroke()
        for (const [rx, rz] of [[0.12, 0.12], [-0.12, 0.12]]) {
          g.beginPath()
          g.arc(x + rx * px, z + rz * px, Math.max(1, px * 0.028), 0, Math.PI * 2)
          g.fill()
        }
      }
    }
    // Le bord, plus clair : un chanfrein.
    g.strokeStyle = shade(1.9)
    g.lineWidth = Math.max(1, px * 0.05)
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth)
  })
}

/** Cadenas dans un hexagone, tracé à la couleur de la pièce. */
function lockTexture(color: string): THREE.CanvasTexture {
  return drawnTexture(256, 256, (g) => {
    g.strokeStyle = g.fillStyle = color
    g.lineJoin = 'round'
    g.lineWidth = 7
    g.beginPath()
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6
      g[k ? 'lineTo' : 'moveTo'](128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112)
    }
    g.closePath()
    g.stroke()
    // L'anse, puis le corps et son trou de serrure.
    g.lineWidth = 12
    g.beginPath()
    g.arc(128, 108, 30, Math.PI, 0)
    g.lineTo(158, 126)
    g.moveTo(98, 108)
    g.lineTo(98, 126)
    g.stroke()
    g.beginPath()
    g.roundRect(80, 122, 96, 70, 10)
    g.fill()
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    g.arc(128, 150, 10, 0, Math.PI * 2)
    g.fill()
    g.fillRect(123, 152, 10, 24)
  })
}

/**
 * @param w largeur (x) et `d` profondeur (z) de la plaque, murs compris
 * @param wall épaisseur des murs qu'elle coiffe
 * @param tint couleur des tôles
 * @param glow couleur du liseré et du cadenas ; sans elle, une plaque nue
 * @returns la plaque, centrée sur l'origine, et ce qui l'anime
 */
export function roomCover(w: number, d: number, wall: number, tint: string, glow?: string): RoomCover {
  const cover = new THREE.Group()
  const base = new THREE.Color(tint)
  const uniforms: CoverUniforms = {
    uHoleFocus: { value: new THREE.Vector3() },
    uHoleOn: { value: 0 },
    uHoleRoom: { value: new THREE.Vector4(0, 0, w / 2 - wall, d / 2 - wall) },
    uHoleFloor: { value: 0 },
    uReveal: { value: 0 },
    // Une plaque nue s'ouvre sur un bord d'acier chauffé, sans couleur.
    uRevealGlow: { value: glow ? new THREE.Color(glow) : base.clone().lerp(new THREE.Color('#8a94a8'), 0.5) },
  }
  const side = covering(new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.6) }), uniforms, wall)
  const top = covering(new THREE.MeshLambertMaterial({ map: platingTexture(w, d, base) }), uniforms, wall)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, THICKNESS, d), [side, side, top, side, side, side])
  plate.position.y = WALL_TOP + THICKNESS / 2
  plate.receiveShadow = true
  cover.add(plate)
  const pierce = (focus: THREE.Vector3 | null) => {
    uniforms.uHoleOn.value = focus ? 1 : 0
    if (!focus) return
    uniforms.uHoleFocus.value.copy(focus)
    // Le couvercle ne bouge pas : sa place dans le monde est celle de la pièce.
    const m = cover.matrixWorld.elements
    uniforms.uHoleRoom.value.x = m[12]
    uniforms.uHoleRoom.value.y = m[14]
    uniforms.uHoleFloor.value = m[13]
  }
  const opening = (k: number) => {
    const eased = Math.max(0, (k - UNLOCK) / (1 - UNLOCK))
    uniforms.uReveal.value = eased * eased * (3 - 2 * eased)
  }
  if (!glow) return { cover, update: () => {}, pierce, reveal: opening }

  const y = WALL_TOP + THICKNESS + 0.004
  const light = covering(new THREE.MeshBasicMaterial({ color: glow }), uniforms, wall)
  const iw = w - INSET * 2, id = d - INSET * 2
  for (const s of [-1, 1]) {
    const along = new THREE.Mesh(new THREE.BoxGeometry(iw + STRIP, 0.008, STRIP), light)
    along.position.set(0, y, (s * id) / 2)
    const across = new THREE.Mesh(new THREE.BoxGeometry(STRIP, 0.008, id + STRIP), light)
    across.position.set((s * iw) / 2, y, 0)
    cover.add(along, across)
  }
  const size = Math.min(1.5, Math.min(iw, id) * 0.5)
  const lockMaterial = covering(new THREE.MeshBasicMaterial({ map: lockTexture(glow), transparent: true, depthWrite: false }), uniforms, wall)
  const lock = new THREE.Mesh(new THREE.PlaneGeometry(size, size), lockMaterial)
  lock.rotation.x = -Math.PI / 2
  lock.position.y = y
  cover.add(lock)
  const lit = new THREE.Color(glow)
  /** L'éclat du déverrouillage (0 au repos) : il prend le pas sur la respiration du liseré. */
  let flash = 0
  return {
    cover,
    pierce,
    update: (t) => {
      // Le liseré respire, lentement ; le cadenas reste en retrait.
      const k = 0.62 + 0.38 * Math.sin(t * 1.4)
      light.color.copy(lit).multiplyScalar(0.55 + 0.45 * k + flash * 1.6)
      lockMaterial.opacity = Math.min(1, 0.5 + 0.2 * k + flash)
    },
    reveal: (k) => {
      opening(k)
      // Le cadenas s'illumine et grossit, le liseré s'embrase, puis les tôles partent.
      const unlock = Math.min(1, k / UNLOCK)
      flash = k > 0 ? Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.5 + unlock * 0.5 : 0
      lock.scale.setScalar(1 + 0.25 * unlock * (2 - unlock))
    },
  }
}
