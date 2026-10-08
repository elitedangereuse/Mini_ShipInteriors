import * as THREE from 'three'
import { beamMaterial, box, cylinder, drawnTexture, ellipseSegments, glow, holoMaterial, holoTime, keepShared, lit, panelTexture, part, pointCloud, type Builder } from './kit'

/*
 * Le simulateur d'accueil des nouveaux venus (cf. src/tutorial.ts) : une salle holographique.
 * Des parois sombres quadrillées de cyan, posées sur le sol de la simulation, qui s'étend à perte
 * de vue autour d'elles ; une grille au sol, des marquages d'exercice, des panneaux de consignes
 * accrochés aux murs, et le téléporteur qui dépose la recrue sur le pont principal, sa leçon finie.
 */

const CYAN = '#39d0ff'

// ---------------------------------------------------------------- les parois

/** Quadrillage d'une paroi : `lines` seules (ce qui luit), ou sur le fond bleu nuit du panneau. */
function wallTexture(lines: boolean): THREE.CanvasTexture {
  const S = 256, N = 2
  return drawnTexture(S, S, (g) => {
    g.fillStyle = lines ? '#000' : '#0a1220'
    g.fillRect(0, 0, S, S)
    g.strokeStyle = g.fillStyle = CYAN
    g.globalAlpha = lines ? 0.5 : 0.7
    g.lineWidth = 3
    for (let i = 0; i <= N; i++) {
      g.beginPath()
      g.moveTo((i * S) / N, 0)
      g.lineTo((i * S) / N, S)
      g.moveTo(0, (i * S) / N)
      g.lineTo(S, (i * S) / N)
      g.stroke()
    }
    // Un filet plus vif en pied de paroi, et de petites croix aux intersections.
    g.globalAlpha = lines ? 0.9 : 1
    g.fillRect(0, S - 14, S, 4)
    for (let x = 0; x <= N; x++) for (let y = 1; y < N; y++) g.fillRect((x * S) / N - 9, (y * S) / N - 2, 18, 4)
  })
}

const wallMaterial = () => sharedSim('wall', () => new THREE.MeshLambertMaterial({ map: wallTexture(false), emissive: '#ffffff', emissiveMap: wallTexture(true), emissiveIntensity: 0.85 }))
const floorMaterial = () => sharedSim('floor', () => new THREE.MeshLambertMaterial({ color: '#17243a' }))
const capMaterial = () => sharedSim('cap', () => new THREE.MeshLambertMaterial({ color: '#0d1626' }))

const simMaterials = new Map<string, THREE.Material>()
function sharedSim<T extends THREE.Material>(key: string, make: () => T): T {
  let m = simMaterials.get(key) as T | undefined
  if (!m) simMaterials.set(key, (m = keepShared(make())))
  return m
}

/**
 * Parois et poteaux du simulateur (cf. LevelDef.walls) : des panneaux bleu nuit quadrillés de
 * cyan, coiffés d'un filet de lumière ; des émetteurs aux angles.
 */
export const SIM_WALLS = {
  wall(cx: number, cz: number, alongX: boolean): THREE.Object3D {
    const g = new THREE.Group()
    const t = 0.3
    g.add(part(new THREE.BoxGeometry(1, 0.97, t), wallMaterial(), 0, 0.485, 0))
    g.add(part(new THREE.BoxGeometry(1, 0.03, t + 0.01), capMaterial(), 0, 0.985, 0))
    g.add(part(new THREE.BoxGeometry(1, 0.012, 0.07), glow(CYAN), 0, 1.004, 0))
    g.position.set(cx, 0, cz)
    if (!alongX) g.rotation.y = Math.PI / 2
    g.updateMatrixWorld(true)
    return g
  },
  post(vx: number, vz: number): THREE.Object3D {
    const g = new THREE.Group()
    const w = 0.35
    g.add(part(new THREE.BoxGeometry(w, 1.05, w), capMaterial(), 0, 0.525, 0))
    g.add(part(new THREE.BoxGeometry(w - 0.12, 0.03, w - 0.12), glow(CYAN), 0, 1.062, 0))
    // Un filet lumineux sur chaque face : l'émetteur qui tient la paroi.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2
      g.add(part(new THREE.BoxGeometry(i % 2 ? 0.008 : 0.05, 0.7, i % 2 ? 0.05 : 0.008), glow(CYAN), Math.sin(a) * (w / 2 + 0.002), 0.55, Math.cos(a) * (w / 2 + 0.002)))
    }
    g.position.set(vx, 0, vz)
    g.updateMatrixWorld(true)
    return g
  },
  /** Dalle unie, bleu nuit : le quadrillage (cf. sim-grid) s'y lit sans rien d'autre. */
  floor(x: number, z: number): THREE.Object3D {
    const m = part(new THREE.BoxGeometry(1, 0.3, 1), floorMaterial(), x, -0.15, z)
    m.receiveShadow = true
    m.updateMatrixWorld(true)
    return m
  },
}

// ---------------------------------------------------------------- le sol de la simulation

/**
 * Le sol de la simulation, tout autour des salles : une dalle sombre quadrillée qui s'étend à
 * perte de vue et s'efface au loin, une plateforme graduée et cernée de lumière au pied des
 * parois, des cases qui s'allument çà et là. Les salles y sont posées : elles ne flottent plus
 * dans le vide. Autour, le décor de la simulation : l'enceinte de projection, dont on ne voit que
 * le fond, des pylônes, des volumes filaires à la dérive, des colonnes de données, des poussières.
 * `label` : « x0,z0,x1,z1;… », les rectangles des salles (bords extérieurs), vus du meuble.
 */
const simVoid: Builder = ({ label = '-8,-3,8,3', random }) => {
  const rects = label.split(';').map((r) => r.split(',').map(Number))
  const boxes = rects.slice(0, 2).map(([x0, z0, x1, z1]) => new THREE.Vector4((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2))
  while (boxes.length < 2) boxes.push(boxes[0])
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: holoTime,
      uBoxA: { value: boxes[0] },
      uBoxB: { value: boxes[1] },
      uBase: { value: new THREE.Color('#05090f') },
      uApron: { value: new THREE.Color('#0b1626') },
      uLine: { value: new THREE.Color(CYAN) },
    },
    vertexShader: `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec4 uBoxA;
      uniform vec4 uBoxB;
      uniform vec3 uBase;
      uniform vec3 uApron;
      uniform vec3 uLine;
      varying vec2 vP;
      float sdBox(vec2 p, vec4 b) {
        vec2 d = abs(p - b.xy) - b.zw;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }
      float hash(vec2 c) {
        return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
      }
      float grid(vec2 p, float step) {
        vec2 q = p / step;
        vec2 g = abs(fract(q) - 0.5) / fwidth(q);
        return 1.0 - clamp(min(g.x, g.y) - 0.2, 0.0, 1.0);
      }
      void main() {
        // Le plan est couché : son y est le nord du pont.
        vec2 p = vec2(vP.x, -vP.y);
        float d = min(sdBox(p, uBoxA), sdBox(p, uBoxB));
        float far = exp(-max(d, 0.0) / 11.0);
        float apron = 1.0 - smoothstep(1.0, 1.06, d);
        vec3 col = mix(uBase, uApron, apron * 0.9);
        // Quadrillage : une ligne par tuile, une plus vive toutes les quatre.
        float lines = grid(p, 1.0) * 0.16 + grid(p + 0.5, 4.0) * 0.3;
        col += uLine * lines * far * (1.0 - apron * 0.55);
        // Le bord de la plateforme, et la lueur des parois à leur pied.
        float edge = 1.0 - smoothstep(0.0, 0.05, abs(d - 1.03));
        col += uLine * (edge * 0.9 + exp(-max(d, 0.0) * 3.2) * 0.2 + exp(-abs(d - 1.03) * 7.0) * 0.07);
        // Graduations le long du bord : la plateforme est mesurée, tuile par tuile.
        float ticks = grid(p, 1.0) * step(1.06, d) * (1.0 - step(1.26, d));
        col += uLine * ticks * 0.55;
        // Des cases s'allument et s'éteignent çà et là : la simulation calcule encore son sol.
        vec2 cell = floor(p + 0.5);
        float slot = floor(uTime * 0.35 + hash(cell) * 7.0);
        float on = step(0.972, hash(cell + slot * 17.0));
        float life = fract(uTime * 0.35 + hash(cell) * 7.0);
        col += uLine * on * sin(life * 3.14159) * 0.2 * far * step(1.3, d);
        float a = 1.0 - smoothstep(18.0, 46.0, d);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  })
  const floor = part(new THREE.PlaneGeometry(130, 130), material, 0, -0.02, 0)
  floor.rotation.x = -Math.PI / 2
  // Avant tout ce qui est transparent : les hologrammes des salles se dessinent par-dessus.
  floor.renderOrder = -5
  floor.frustumCulled = false

  const live = new THREE.Group()
  live.add(floor)

  // Pylônes de projection, aux quatre coins de la plateforme : ce sont eux qui « tiennent » la salle.
  const wire = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55, depthWrite: false })
  const [ax0, az0, ax1, az1] = [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))]
  const beams: THREE.ShaderMaterial[] = []
  for (const [x, z] of [[ax0 - 3, az0 - 3], [ax1 + 3, az0 - 3], [ax1 + 3, az1 + 3], [ax0 - 3, az1 + 3]]) {
    const tower = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.1, 0.32, 1.7, 4, 3)), wire)
    tower.position.set(x, 0.85, z)
    tower.rotation.y = Math.PI / 4
    const beam = beamMaterial()
    beam.uniforms.uColor.value.set(CYAN)
    beam.uniforms.uIntensity.value = 0.35
    beams.push(beam)
    const column = part(new THREE.CylinderGeometry(0.03, 0.1, 2.6, 12, 1, true), beam, x, 3, z)
    const pad = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ellipseSegments(0.6, 0.6, 0, 32)), wire)
    pad.position.set(x, 0.01, z)
    live.add(tower, column, pad, part(new THREE.OctahedronGeometry(0.09), glow(CYAN), x, 1.76, z))
  }

  // Volumes filaires à la dérive au-dessus du sol : la simulation, qui n'a pas fini de se charger.
  // Loin des parois : rien ne passe devant les salles, d'où qu'on regarde.
  const shapes = [() => new THREE.IcosahedronGeometry(1, 0), () => new THREE.OctahedronGeometry(1, 0), () => new THREE.BoxGeometry(1.3, 1.3, 1.3), () => new THREE.TetrahedronGeometry(1.1, 0)]
  const drift: { o: THREE.Object3D; y: number; spin: number; phase: number }[] = []
  const cx = (ax0 + ax1) / 2, cz = (az0 + az1) / 2
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + random() * 0.3
    const r = 7 + random() * 9
    const size = 0.3 + random() * 0.75
    const o = new THREE.LineSegments(new THREE.EdgesGeometry(shapes[i % shapes.length]()), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.16 + random() * 0.3, depthWrite: false }))
    o.scale.setScalar(size)
    const y = 0.9 + random() * 1.6
    o.position.set(cx + Math.cos(a) * ((ax1 - ax0) / 2 + r), y, cz + Math.sin(a) * ((az1 - az0) / 2 + r))
    o.rotation.set(random() * 3, random() * 3, 0)
    drift.push({ o, y, spin: (random() - 0.5) * 0.5, phase: random() * 6 })
    live.add(o)
  }
  // L'enceinte de projection : un mur de lumière quadrillé qui se dresse autour de la plateforme.
  // On n'en voit que le fond : les pans tournés vers la caméra s'effacent, rien ne passe devant
  // les salles, d'où qu'on regarde.
  // Elle suit le bord de la plateforme : le tour de la grande salle, puis celui de la petite, à l'est.
  const D = 1.03, H = 2.3
  const pts: number[] = [], normals: number[] = []
  const sheet: number[] = [], sheetNormals: number[] = []
  const seg = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, nx: number, nz: number) => {
    pts.push(x0, y0, z0, x1, y1, z1)
    normals.push(nx, 0, nz, nx, 0, nz)
  }
  const [A, B] = [rects[0], rects[1] ?? rects[0]]
  const outline = [[A[0] - D, A[1] - D], [A[2] + D, A[1] - D], [B[2] + D, B[1] - D], [B[2] + D, B[3] + D], [A[2] + D, A[3] + D], [A[0] - D, A[3] + D]]
  if (B !== A) outline.splice(2, 0, [A[2] + D, B[1] - D]), outline.splice(5, 0, [A[2] + D, B[3] + D])
  outline.forEach(([x0, z0], k) => {
    const [x1, z1] = outline[(k + 1) % outline.length]
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 0.01) return
    const nx = (z1 - z0) / len, nz = -(x1 - x0) / len
    const n = Math.max(1, Math.round(len))
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n
      seg(x, 0, z, x, i % 4 ? H * 0.7 : H, z, nx, nz)
    }
    for (let y = 0.575; y < H; y += 0.575) seg(x0, y, z0, x1, y, z1, nx, nz)
    // Le rideau de lumière derrière le quadrillage.
    sheet.push(x0, 0, z0, x1, 0, z1, x1, H, z1, x0, 0, z0, x1, H, z1, x0, H, z0)
    for (let i = 0; i < 6; i++) sheetNormals.push(nx, 0, nz)
  })
  const fenceGeometry = new THREE.BufferGeometry()
  fenceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  fenceGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  const fenceMaterial = (gain: number) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(CYAN) }, uTime: holoTime, uHeight: { value: H }, uGain: { value: gain } },
    vertexShader: `
      varying float vBack;
      varying float vH;
      void main() {
        vBack = -(mat3(viewMatrix) * normal).z;
        vH = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uHeight;
      uniform float uGain;
      varying float vBack;
      varying float vH;
      void main() {
        // Plus vif au pied, il se perd vers le haut ; un balayage lent le parcourt.
        float scan = 0.8 + 0.2 * sin(vH * 5.0 - uTime * 1.2);
        float up = 1.0 - vH / uHeight;
        float a = smoothstep(0.08, 0.4, vBack) * up * up * uGain * scan;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const fence = new THREE.LineSegments(fenceGeometry, fenceMaterial(1.3))
  fence.frustumCulled = false
  const curtainGeometry = new THREE.BufferGeometry()
  curtainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sheet, 3))
  curtainGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(sheetNormals, 3))
  const curtain = new THREE.Mesh(curtainGeometry, fenceMaterial(0.36))
  curtain.frustumCulled = false
  curtain.renderOrder = -4
  live.add(curtain, fence)

  // Colonnes de données : des traits verticaux en pointillé, au loin, qui défilent vers le haut.
  const streams: THREE.Object3D[] = []
  const dashed = new THREE.LineDashedMaterial({ color: CYAN, transparent: true, opacity: 0.4, dashSize: 0.22, gapSize: 0.3, depthWrite: false })
  for (let i = 0; i < 18; i++) {
    const a = random() * Math.PI * 2
    const r = 6 + random() * 12
    const h = 1.5 + random() * 3
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)]), dashed)
    line.computeLineDistances()
    line.position.set(cx + Math.cos(a) * ((ax1 - ax0) / 2 + r), 0, cz + Math.sin(a) * ((az1 - az0) / 2 + r))
    line.userData.speed = 0.25 + random() * 0.5
    streams.push(line)
    live.add(line)
  }

  // Poussières de lumière en suspension, tout autour.
  const N = 220
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sizes = new Float32Array(N)
  const tint = new THREE.Color(CYAN)
  for (let i = 0; i < N; i++) {
    const a = random() * Math.PI * 2
    const r = 2.5 + random() * 16
    pos.set([cx + Math.cos(a) * ((ax1 - ax0) / 2 + r), 0.3 + random() * 4.5, cz + Math.sin(a) * ((az1 - az0) / 2 + r)], i * 3)
    const k = 0.35 + random() * 0.65
    col.set([tint.r * k, tint.g * k, tint.b * k], i * 3)
    sizes[i] = 0.03 + random() * 0.05
  }
  const motes = pointCloud(pos, col, sizes)
  live.add(motes)

  return {
    live,
    update: (t) => {
      for (const b of beams) b.uniforms.uTime.value = t
      for (const l of streams) l.position.y = ((t * l.userData.speed) % 0.52) - 0.52
      motes.position.y = Math.sin(t * 0.25) * 0.25
      for (const d of drift) {
        d.o.rotation.y = t * d.spin
        d.o.rotation.x += 0.0008
        d.o.position.y = d.y + Math.sin(t * 0.5 + d.phase) * 0.18
      }
    },
  }
}

/**
 * Marquage d'exercice projeté au sol. `label` : « genre|texte ».
 * - pad : l'aire d'arrivée, un cercle gradué ;
 * - target : une cible carrée à coins marqués, sa lettre au centre ;
 * - zone : un cadre de `l`x`p` tuiles (« zone|texte|3x2 »), son nom dans un coin ;
 * - lane : un couloir de chevrons, long de `l` tuiles (« lane||6 »), qui file vers +x.
 */
const simMark: Builder = ({ label = 'pad|' }) => {
  const [kind, text = '', dims = '1x1'] = label.split('|')
  const [w, d] = kind === 'lane' ? [Number(dims), 0.5] : kind === 'zone' ? dims.split('x').map(Number) : kind === 'pad' ? [1.5, 1.5] : [1, 1]
  const px = 128
  const W = Math.round(w * px), H = Math.round(d * px)
  const texture = drawnTexture(W, H, (g) => {
    g.strokeStyle = g.fillStyle = CYAN
    g.textBaseline = 'middle'
    g.textAlign = 'center'
    if (kind === 'pad') {
      const c = W / 2
      g.lineWidth = 5
      g.globalAlpha = 0.9
      g.beginPath()
      g.arc(c, c, c - 8, 0, Math.PI * 2)
      g.stroke()
      g.globalAlpha = 0.45
      g.lineWidth = 2
      g.beginPath()
      g.arc(c, c, c - 34, 0, Math.PI * 2)
      g.stroke()
      // Graduations.
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        const r0 = c - (i % 6 ? 22 : 34)
        g.globalAlpha = i % 6 ? 0.5 : 0.95
        g.lineWidth = i % 6 ? 2 : 5
        g.beginPath()
        g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0)
        g.lineTo(c + Math.cos(a) * (c - 10), c + Math.sin(a) * (c - 10))
        g.stroke()
      }
      g.globalAlpha = 0.14
      g.beginPath()
      g.arc(c, c, c - 34, 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = 0.85
      g.font = '700 17px system-ui, "Segoe UI", sans-serif'
      g.fillText(text.toUpperCase(), c, c + 34)
    } else if (kind === 'target') {
      const m = 14, l = 30
      g.lineWidth = 6
      g.globalAlpha = 0.9
      for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const x = sx ? W - m : m, y = sy ? H - m : m
        g.beginPath()
        g.moveTo(x + (sx ? -l : l), y)
        g.lineTo(x, y)
        g.lineTo(x, y + (sy ? -l : l))
        g.stroke()
      }
      g.globalAlpha = 0.12
      g.fillRect(m, m, W - 2 * m, H - 2 * m)
      g.globalAlpha = 0.6
      g.font = '800 44px system-ui, "Segoe UI", sans-serif'
      g.fillText(text, W / 2, H / 2 + 2)
    } else if (kind === 'zone') {
      const m = 10
      g.globalAlpha = 0.08
      g.fillRect(m, m, W - 2 * m, H - 2 * m)
      g.globalAlpha = 0.75
      g.lineWidth = 4
      g.setLineDash([22, 12])
      g.strokeRect(m, m, W - 2 * m, H - 2 * m)
      g.setLineDash([])
      g.globalAlpha = 0.85
      g.font = '700 19px system-ui, "Segoe UI", sans-serif'
      g.textAlign = 'left'
      const tw = g.measureText(text.toUpperCase()).width
      g.fillRect(m, m, tw + 20, 28)
      g.globalCompositeOperation = 'destination-out'
      g.globalAlpha = 1
      g.fillText(text.toUpperCase(), m + 10, m + 15)
    } else {
      // Chevrons : plus vifs vers l'arrivée.
      g.lineWidth = 7
      g.lineJoin = 'miter'
      for (let x = 20, i = 0; x < W - 20; x += 44, i++) {
        g.globalAlpha = 0.25 + 0.5 * (x / W)
        g.beginPath()
        g.moveTo(x, H / 2 - 16)
        g.lineTo(x + 16, H / 2)
        g.lineTo(x, H / 2 + 16)
        g.stroke()
      }
    }
  })
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 })
  const plane = part(new THREE.PlaneGeometry(w, d), material, 0, 0.012, 0)
  plane.rotation.x = -Math.PI / 2
  const live = new THREE.Group()
  live.add(plane)
  const phase = kind.length + text.length
  return {
    live,
    update: (t) => {
      material.opacity = kind === 'lane' ? 0.55 + 0.35 * Math.sin(t * 3) : 0.82 + Math.sin(t * 1.7 + phase) * 0.12
    },
  }
}

/**
 * Projecteur holographique sur pied : une colonne basse, coiffée d'une lentille, qui projette un
 * volume filaire tournant (`label` : 'ship', un vaisseau ; 'globe', une planète ; sinon un polyèdre).
 */
const simProjector: Builder = ({ label = 'ship' }) => {
  const g = new THREE.Group()
  g.add(cylinder(0.2, 0.24, 0.05, lit('#1b2738', 'metal'), 0, 0.025, 0, 20))
  g.add(cylinder(0.09, 0.13, 0.34, lit('#101a2c', 'metal'), 0, 0.22, 0, 14))
  g.add(cylinder(0.16, 0.1, 0.05, lit('#22324a', 'metal'), 0, 0.41, 0, 20))
  g.add(cylinder(0.12, 0.12, 0.012, glow(CYAN), 0, 0.44, 0, 20))
  const wire = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9, depthWrite: false })
  const geo = label === 'globe'
    ? new THREE.WireframeGeometry(new THREE.SphereGeometry(0.19, 10, 7))
    : label === 'ship'
      // Une silhouette de vaisseau : un fuseau aplati, ailes en delta.
      ? new THREE.EdgesGeometry(new THREE.ConeGeometry(0.2, 0.46, 3, 1).rotateZ(-Math.PI / 2).scale(1, 0.32, 1.25))
      : new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.19, 0))
  const holo = new THREE.LineSegments(geo, wire)
  holo.position.y = 0.82
  const beam = beamMaterial()
  beam.uniforms.uColor.value.set(CYAN)
  beam.uniforms.uIntensity.value = 0.4
  const cone = part(new THREE.CylinderGeometry(0.26, 0.1, 0.62, 20, 1, true), beam, 0, 0.76, 0)
  // Le faisceau s'évase vers le haut : sa base (lumineuse) est en bas.
  cone.rotation.x = Math.PI
  const live = new THREE.Group()
  live.add(cone, holo)
  return {
    solid: g,
    live,
    update: (t) => {
      beam.uniforms.uTime.value = t
      holo.rotation.y = t * 0.6
      holo.position.y = 0.82 + Math.sin(t * 1.3) * 0.02
    },
  }
}

/**
 * Grille holographique posée au sol d'une salle : des lignes cyan à chaque tuile, plus vives en
 * bordure. `label` : « largeur x profondeur » (en tuiles).
 */
const simGrid: Builder = ({ label = '4x4' }) => {
  const [w, d] = label.split('x').map(Number)
  const px = 64
  const texture = drawnTexture(w * px, d * px, (g) => {
    g.strokeStyle = CYAN
    g.lineWidth = 1.5
    g.globalAlpha = 0.5
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
    g.globalAlpha = 0.7
    g.lineWidth = 3
    g.strokeRect(2, 2, w * px - 4, d * px - 4)
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
  'sim-void': simVoid,
  'sim-mark': simMark,
  'sim-projector': simProjector,
}
