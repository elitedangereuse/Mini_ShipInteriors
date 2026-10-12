// Les couleurs de CMDR Arena (cf. ARENA_PALETTE dans shared/arena.js) : distinctes pour tous, et
// les mêmes partout.
//   npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ARENA_PALETTE, ARENA_TEAMS } from '../shared/arena.js'

/**
 * Simulation des dichromasies (Machado, Oliveira et Fernandes, 2009, sévérité 1), dans l'espace RVB
 * linéaire : comme les voit quelqu'un qui n'a pas l'un des trois cônes.
 */
const DICHROMACY = {
  protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutéranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
}

const linear = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

/** CIELAB (D65), d'une couleur en RVB linéaire. */
function lab([r, g, b]) {
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Écart de couleur CIEDE2000 : autour de 2, on devine une différence ; au-delà de 15, on ne confond plus. */
function deltaE([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2)
  const hue = (x, y) => { const h = Math.atan2(y, x) / rad; return h < 0 ? h + 360 : h }
  const hp1 = hue(ap1, b1), hp2 = hue(ap2, b2)
  let dh = hp2 - hp1
  if (Cp1 * Cp2 === 0) dh = 0
  else if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dL = L2 - L1, dC = Cp2 - Cp1, dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * rad) / 2)
  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2
  let hm = hp1 + hp2
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hm += hm < 360 ? 360 : -360
    hm /= 2
  }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad)
  const theta = 30 * Math.exp(-(((hm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T
  const Rt = -Math.sin(2 * theta * rad) * Rc
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}

const seen = (hex, m) => lab(linear(hex).map((_, i, c) => Math.min(1, Math.max(0, m[i][0] * c[0] + m[i][1] * c[1] + m[i][2] * c[2]))))

test('arène : soi, les siens, ceux d\'en face et les soins se distinguent, daltonisme compris', () => {
  const names = Object.keys(ARENA_PALETTE)
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]))
  for (const [a, b] of pairs) assert.ok(deltaE(lab(linear(ARENA_PALETTE[a])), lab(linear(ARENA_PALETTE[b]))) > 25, `${a} et ${b}, en vision ordinaire`)
  for (const [kind, m] of Object.entries(DICHROMACY)) {
    for (const [a, b] of pairs) {
      const d = deltaE(seen(ARENA_PALETTE[a], m), seen(ARENA_PALETTE[b], m))
      assert.ok(d > 15, `${a} et ${b} se confondent en ${kind} (écart ${d.toFixed(1)})`)
    }
    // Les siens et ceux d'en face : ce qui compte le plus, de loin.
    assert.ok(deltaE(seen(ARENA_PALETTE.ally, m), seen(ARENA_PALETTE.enemy, m)) > 40, `alliés et adversaires, en ${kind}`)
    // Pour un spectateur, les deux camps à leurs couleurs du lobby.
    assert.ok(deltaE(seen(ARENA_TEAMS[0].color, m), seen(ARENA_TEAMS[1].color, m)) > 25, `les deux camps, en ${kind}`)
  }
})

test('arène : l\'interface reprend la palette de la partie', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  const rule = css.match(/\.arena-hud, \.arena-end \{([^}]*)\}/)
  assert.ok(rule, 'les couleurs du HUD de l\'arène')
  for (const [name, hex] of Object.entries(ARENA_PALETTE)) assert.match(rule[1], new RegExp(`--${name}: ${hex};`, 'i'), `--${name} dans style.css`)
})
