import * as THREE from 'three'
import { animatedScreen, barX, barZ, box, cylinder, decal, drawnTexture, glow, lit, mesh, part, sphere, type Builder } from './kit'

/*
 * Les objets des quêtes du bord (cf. src/quests/) : ce qu'on trouve, ce qu'on rapporte, ce qu'on
 * pose, ce qui flotte. Ils n'apparaissent qu'au joueur dont la quête en est là, et ne bloquent pas le passage.
 * Mêmes conventions que decor.ts : face à +z, posé au sol, centré sur l'origine.
 */

const C = {
  steel: '#b9c1cc',
  steelDark: '#6d7480',
  iron: '#2b2e35',
  ironLight: '#454a55',
  rubber: '#17181c',
  kibble: '#8a5a34',
  leash: '#c0392b',
  card: '#c9a66b',
  cardDark: '#a8854f',
  foam: '#2c2f3a',
  foamLight: '#3c4050',
  tape: '#ffcf33',
  dummy: '#f2b632',
  dummyDark: '#1d1f24',
  rock: '#5a5148',
  rockLight: '#7a6e60',
}

/** La gamelle de Jameson : inox cabossé, croquettes sèches, une laisse mâchonnée à côté. */
const bowl: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.13, 0.16, 0.07, lit(C.steel, 'metal'), 0, 0.035, 0, 18), cylinder(0.105, 0.105, 0.012, lit(C.kibble), 0, 0.068, 0, 14))
  // Quelques croquettes tombées autour.
  for (const [x, z] of [[0.2, 0.06], [-0.19, 0.1], [0.12, -0.19], [0.24, -0.08]]) g.add(sphere(0.016, lit(C.kibble), x, 0.014, z, 6))
  // La laisse, lâchée en vrac, et sa poignée mordillée.
  const leash = mesh(new THREE.TorusGeometry(0.09, 0.012, 5, 14, Math.PI * 1.5), lit(C.leash), -0.27, 0.014, -0.08)
  leash.rotation.x = Math.PI / 2
  g.add(leash, barX(0.012, 0.16, lit(C.leash), -0.12, 0.014, -0.17, 6), box(0.05, 0.02, 0.03, lit(C.steelDark, 'metal'), -0.03, 0.012, -0.17))
  // La médaille gravée, posée contre le bord.
  const tag = part(new THREE.CircleGeometry(0.035, 14), new THREE.MeshLambertMaterial({ map: nameTag('JAMESON') }), 0, 0.045, 0.158)
  tag.rotation.x = -0.35
  g.add(tag)
  return { solid: g }
}

function nameTag(name: string): THREE.Texture {
  return drawnTexture(96, 96, (c) => {
    c.fillStyle = '#d9b44a'
    c.fillRect(0, 0, 96, 96)
    c.fillStyle = '#4a3a12'
    c.font = 'bold 17px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(name, 48, 50)
  })
}

/** Traces de pattes, noires de suie, qui s'éloignent (vers -z). */
const paws: Builder = () => {
  const texture = drawnTexture(128, 256, (c) => {
    c.clearRect(0, 0, 128, 256)
    const print = (x: number, y: number, a: number, alpha: number) => {
      c.save()
      c.translate(x, y)
      c.rotate(a)
      c.fillStyle = `rgba(18, 16, 15, ${alpha})`
      c.beginPath()
      c.ellipse(0, 6, 9, 8, 0, 0, Math.PI * 2)
      c.fill()
      for (const [dx, dy] of [[-10, -6], [-4, -12], [4, -12], [10, -6]]) {
        c.beginPath()
        c.ellipse(dx, dy, 3.6, 4.6, 0, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }
    // Les plus fraîches en bas (près de nous), de plus en plus pâles en s'éloignant.
    for (let i = 0; i < 7; i++) print(i % 2 ? 78 : 46, 236 - i * 34, (i % 2 ? 0.12 : -0.12), 0.85 - i * 0.09)
  })
  // Un peu plus haut que les autres marques au sol (taches, câbles) : elles passeraient dessus.
  return { live: decal(texture, 0.5, 1, 0.012) }
}

/** Un tas de minerai, d'où dépasse une carte magnétique qui clignote. */
const keycard: Builder = ({ random }) => {
  const g = new THREE.Group()
  for (let i = 0; i < 7; i++) {
    const r = 0.05 + random() * 0.05
    const rock = mesh(new THREE.DodecahedronGeometry(r, 0), lit(i % 3 ? C.rock : C.rockLight), (random() - 0.5) * 0.3, r * 0.7, (random() - 0.5) * 0.24)
    rock.rotation.set(random() * 3, random() * 3, random() * 3)
    g.add(rock)
  }
  const card = box(0.11, 0.16, 0.012, lit('#e9edf2'), 0.02, 0.13, 0.03)
  card.rotation.set(-0.5, 0.3, 0.25)
  g.add(card)
  const live = new THREE.Group()
  const stripe = part(new THREE.BoxGeometry(0.1, 0.03, 0.014), glow('#ff8a1c'), 0.02, 0.16, 0.012)
  stripe.rotation.copy(card.rotation)
  live.add(stripe)
  return { solid: g, live, update: (t) => (stripe.visible = Math.sin(t * 5) > -0.3) }
}

/** Kettlebell de seize kilos, posée sur un couvercle de marmite : une presse à terrine. */
const kettlebell: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.17, 0.17, 0.02, lit(C.steel, 'metal'), 0, 0.06, 0, 20), cylinder(0.15, 0.16, 0.05, lit('#7a2e1f'), 0, 0.025, 0, 20))
  g.add(sphere(0.115, lit(C.iron, 'metal'), 0, 0.18, 0, 14))
  const handle = mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 14, Math.PI), lit(C.iron, 'metal'), 0, 0.27, 0)
  g.add(handle, box(0.07, 0.035, 0.005, lit('#f4f1e6'), 0, 0.19, 0.113))
  return { solid: g }
}

/** Une paire d'haltères, ficelées à un tuteur : des contrepoids de jardinière. */
const dumbbells: Builder = () => {
  const g = new THREE.Group()
  for (const z of [-0.07, 0.07]) {
    g.add(barX(0.018, 0.26, lit(C.steel, 'metal'), 0, 0.06, z, 8))
    for (const x of [-0.13, 0.13]) g.add(barX(0.06, 0.07, lit(C.iron, 'metal'), x, 0.06, z, 6))
  }
  // Le tuteur, sa ficelle, et le plant qui s'y accroche.
  g.add(cylinder(0.012, 0.012, 0.9, lit('#9a6a45', 'wood'), 0, 0.45, 0, 6), cylinder(0.02, 0.02, 0.04, lit('#d8c49a'), 0, 0.1, 0, 6))
  for (let i = 0; i < 4; i++) g.add(sphere(0.045, lit(i % 2 ? '#4f8a3c' : '#63a548'), (i % 2 ? 0.05 : -0.05), 0.4 + i * 0.13, i % 2 ? 0.02 : -0.02, 6))
  g.add(sphere(0.035, lit('#d6402e'), 0.07, 0.62, 0.03, 8), sphere(0.03, lit('#d6402e'), -0.07, 0.5, -0.02, 8))
  return { solid: g }
}

/** Un disque de vingt kilos, glissé sous une béquille : une cale de fortune. */
const plate: Builder = () => {
  const g = new THREE.Group()
  g.add(cylinder(0.2, 0.2, 0.045, lit(C.iron, 'metal'), 0, 0.023, 0, 22), cylinder(0.19, 0.19, 0.01, lit(C.ironLight, 'metal'), 0, 0.05, 0, 22))
  g.add(cylinder(0.035, 0.035, 0.012, lit(C.rubber), 0, 0.055, 0, 12))
  // Une béquille de chandelle posée dessus.
  g.add(box(0.09, 0.02, 0.09, lit(C.dummy), 0, 0.066, 0), cylinder(0.025, 0.03, 0.2, lit(C.steelDark, 'metal'), 0, 0.17, 0, 8))
  return { solid: g }
}

/** Carton de dalles de mousse acoustique, le surplus du studio. */
const foamBox: Builder = () => {
  const g = new THREE.Group()
  g.add(box(0.42, 0.26, 0.32, lit(C.card), 0, 0.13, 0), box(0.43, 0.02, 0.05, lit(C.cardDark), 0, 0.2, 0.14))
  // Rabats ouverts, dalles qui dépassent.
  const flap = (x: number, a: number) => {
    const f = box(0.2, 0.012, 0.32, lit(C.cardDark), x, 0.27, 0)
    f.rotation.z = a
    g.add(f)
  }
  flap(-0.28, 0.9)
  flap(0.28, -0.9)
  for (let i = 0; i < 4; i++) g.add(box(0.32, 0.2, 0.045, lit(i % 2 ? C.foam : C.foamLight), 0, 0.3, -0.09 + i * 0.06))
  const label = part(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshLambertMaterial({ map: boxLabel() }), 0, 0.11, 0.162)
  g.add(label)
  return { solid: g }
}

function boxLabel(): THREE.Texture {
  return drawnTexture(240, 80, (c) => {
    c.fillStyle = '#f4f1e6'
    c.fillRect(0, 0, 240, 80)
    c.fillStyle = '#c0392b'
    c.font = 'bold 26px system-ui, sans-serif'
    c.textAlign = 'center'
    c.fillText('RADIO DANGEREUSE', 120, 34)
    c.fillStyle = '#333'
    c.font = '20px system-ui, sans-serif'
    c.fillText('SURPLUS', 120, 62)
  })
}

/** Au sol, autour du socle d'une machine : un cadre de ruban jaune, là où glisser la mousse. */
const baseMark: Builder = () => {
  const g = new THREE.Group()
  const tape = glow(C.tape)
  // Au-dessus de la carte du ciel peinte au sol.
  const half = 0.66, y = 0.045
  for (const s of [-1, 1]) {
    g.add(part(new THREE.BoxGeometry(half * 2 + 0.06, 0.012, 0.06), tape, 0, y, s * half), part(new THREE.BoxGeometry(0.06, 0.012, half * 2 + 0.06), tape, s * half, y, 0))
  }
  // Quatre repères aux coins, qui clignotent : c'est là.
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => part(new THREE.BoxGeometry(0.16, 0.014, 0.16), tape, sx * (half + 0.18), y, sz * (half + 0.18))))
  g.add(...corners)
  return { live: g, update: (t) => { for (const c of corners) c.visible = Math.sin(t * 4) > 0 } }
}

/** Sous le socle : les dalles de mousse posées, dont le bord dépasse en damier de pyramides. */
const baseFoam: Builder = () => {
  const g = new THREE.Group()
  g.add(box(1.36, 0.07, 1.36, lit(C.foam), 0, 0.035, 0))
  const pyramid = new THREE.ConeGeometry(0.075, 0.07, 4)
  pyramid.rotateY(Math.PI / 4)
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      // Le bord seulement : le milieu est sous la machine.
      if (i > 0 && i < 9 && j > 0 && j < 9) continue
      g.add(mesh(pyramid, lit((i + j) % 2 ? C.foam : C.foamLight), -0.585 + i * 0.13, 0.105, -0.585 + j * 0.13))
    }
  }
  return { solid: g }
}

/**
 * T-0, le mannequin d'essai : assis contre le mur, tête penchée, jaune de sécurité à repères
 * noirs. L'écran de sa poitrine grésille : c'est par lui qu'il parle.
 */
const dummy: Builder = () => {
  const g = new THREE.Group()
  const body = lit(C.dummy), joint = lit(C.dummyDark)
  // Assis, dos au mur (-z), jambes allongées vers +z.
  g.add(box(0.3, 0.36, 0.18, body, 0, 0.3, -0.1, 0.03), box(0.26, 0.1, 0.2, joint, 0, 0.1, -0.06, 0.02))
  for (const x of [-0.09, 0.09]) {
    g.add(barZ(0.05, 0.3, body, x, 0.07, 0.12, 8), sphere(0.055, joint, x, 0.07, 0.28, 8), barZ(0.045, 0.26, body, x, 0.06, 0.42, 8), box(0.08, 0.13, 0.05, joint, x, 0.085, 0.56))
  }
  // Bras ballants, mains ouvertes sur le sol.
  for (const s of [-1, 1]) {
    const arm = cylinder(0.04, 0.04, 0.26, body, s * 0.2, 0.3, -0.08, 8)
    arm.rotation.z = s * 0.18
    g.add(arm, sphere(0.045, joint, s * 0.18, 0.44, -0.1, 8), sphere(0.045, joint, s * 0.23, 0.16, -0.06, 8), box(0.07, 0.025, 0.09, body, s * 0.25, 0.02, 0.03))
  }
  // La tête, penchée, avec ses mires d'essai.
  const head = new THREE.Group()
  head.add(sphere(0.105, body, 0, 0, 0, 14), cylinder(0.04, 0.045, 0.07, joint, 0, -0.11, 0, 8))
  for (const s of [-1, 1]) {
    const mark = part(new THREE.CircleGeometry(0.035, 12), new THREE.MeshLambertMaterial({ map: targetMark() }), s * 0.1, 0.005, 0.03)
    mark.rotation.y = s * 1.25
    head.add(mark)
  }
  head.position.set(0.02, 0.6, -0.06)
  head.rotation.set(0.5, 0.15, 0.2)
  g.add(head)
  // L'écran de la poitrine.
  const screen = animatedScreen(64, 40, 6, (c, t) => {
    c.fillStyle = '#04110a'
    c.fillRect(0, 0, 64, 40)
    const flicker = Math.sin(t * 11) > -0.75
    if (!flicker) return
    c.fillStyle = '#39ff8a'
    c.font = 'bold 12px ui-monospace, monospace'
    c.fillText('T-0', 4, 13)
    c.font = '9px ui-monospace, monospace'
    c.fillText('BAT 3 %', 4, 25)
    // Un battement, de plus en plus plat.
    c.strokeStyle = '#39ff8a'
    c.beginPath()
    for (let x = 0; x < 64; x += 2) {
      const beat = (x + Math.floor(t * 6) * 4) % 32
      c.lineTo(x, 33 - (beat === 8 ? 5 : beat === 10 ? -3 : 0))
    }
    c.stroke()
  })
  const live = new THREE.Group()
  live.add(part(new THREE.PlaneGeometry(0.18, 0.11), new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0.36, -0.008))
  return { solid: g, live, update: (t) => screen.tick(t), extent: new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 0.75, 0.6)) }
}

function targetMark(): THREE.Texture {
  return drawnTexture(48, 48, (c) => {
    c.fillStyle = C.dummy
    c.fillRect(0, 0, 48, 48)
    c.fillStyle = '#111'
    c.beginPath()
    c.moveTo(24, 24)
    c.arc(24, 24, 20, 0, Math.PI / 2)
    c.closePath()
    c.fill()
    c.beginPath()
    c.moveTo(24, 24)
    c.arc(24, 24, 20, Math.PI, Math.PI * 1.5)
    c.closePath()
    c.fill()
  })
}

/**
 * Un éclat de mémoire d'Écho : un fragment de projection resté accroché là, qui flotte, tourne et
 * grésille au-dessus de son halo.
 */
const echoShard: Builder = ({ random }) => {
  const g = new THREE.Group()
  const light = new THREE.MeshBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
  const faint = new THREE.MeshBasicMaterial({ color: '#2aa9d8', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false })
  const ring = part(new THREE.RingGeometry(0.13, 0.17, 24), faint, 0, 0.014, 0)
  ring.rotation.x = -Math.PI / 2
  g.add(ring)
  // L'éclat : un cristal effilé, et les lignes de balayage qui le traversent.
  const shard = new THREE.Group()
  const crystal = part(new THREE.OctahedronGeometry(0.09, 0), light)
  crystal.scale.set(0.7, 1.5, 0.7)
  shard.add(crystal)
  const lines = [-0.09, -0.03, 0.03, 0.09].map((y) => part(new THREE.BoxGeometry(0.2, 0.008, 0.008), faint, 0, y, 0))
  shard.add(...lines)
  shard.position.y = 0.62
  g.add(shard)
  const phase = random() * 6
  return {
    live: g,
    update: (t) => {
      shard.rotation.y = t * 1.1 + phase
      shard.position.y = 0.62 + Math.sin(t * 1.7 + phase) * 0.04
      // Il grésille : une extinction brève, de temps en temps.
      shard.visible = Math.sin(t * 9 + phase) > -0.86 || Math.sin(t * 2.3 + phase) > 0
      for (const [i, l] of lines.entries()) l.position.x = Math.sin(t * 13 + i * 2.1 + phase) * 0.012
    },
    extent: new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.85, 0.2)),
  }
}

export const QUESTS_FURNITURE = {
  'quest-echo-shard': echoShard,
  'quest-bowl': bowl,
  'quest-paws': paws,
  'quest-keycard': keycard,
  'quest-kettlebell': kettlebell,
  'quest-dumbbells': dumbbells,
  'quest-plate': plate,
  'quest-foam-box': foamBox,
  'quest-base-mark': baseMark,
  'quest-base-foam': baseFoam,
  'quest-dummy': dummy,
} satisfies Record<string, Builder>
