/** Commandes selon la disposition « standard » du navigateur (Xbox / PlayStation). */

const DEADZONE = 0.18
function stick(x = 0, y = 0) {
  const length = Math.hypot(x, y)
  if (!Number.isFinite(length) || length <= DEADZONE) return [0, 0]
  const scale = (Math.min(length, 1) - DEADZONE) / ((1 - DEADZONE) * length)
  return [x * scale, y * scale]
}

function neutral(connected = false) {
  return {
    connected, active: false, moveX: 0, moveY: 0, lookX: 0, lookY: 0, zoom: 0,
    sprint: false, interact: false, action: false, cancel: false,
    rotateLeft: false, rotateRight: false, help: false, up: false, down: false,
  }
}

/** Lecture par image ; les actions ne se déclenchent qu'au nouvel appui. */
export class GamepadControls {
  index = null
  held = new Set()
  suspended = false
  read

  constructor(read = () => navigator.getGamepads?.() ?? []) {
    this.read = read
  }

  /** Une perte de focus ne doit pas rejouer les boutons restés enfoncés. */
  suspend() {
    this.suspended = true
  }

  poll(enabled = true) {
    let pads
    try {
      pads = this.read().filter((p) => !!p && p.connected && p.mapping === 'standard')
    } catch {
      // API absente ou bloquée par les permissions de la page : le clavier reste disponible.
      pads = []
    }
    const moving = (p) => {
      const [x, y] = stick(p.axes[0], p.axes[1])
      const [rx, ry] = stick(p.axes[2], p.axes[3])
      return !!(x || y || rx || ry || p.buttons.some((b) => b.pressed))
    }
    const current = pads.find((p) => p.index === this.index)
    const pad = current && moving(current) ? current : pads.find(moving) ?? current ?? pads[0]
    if (!pad) {
      this.index = null
      this.held.clear()
      return neutral()
    }
    const changed = this.index !== null && this.index !== pad.index
    this.index = pad.index
    const [moveX, moveY] = stick(pad.axes[0], pad.axes[1])
    const [lookX, lookY] = stick(pad.axes[2], pad.axes[3])
    const on = (i) => !!pad.buttons[i]?.pressed
    const held = new Set()
    for (let i = 0; i < pad.buttons.length; i++) if (on(i)) held.add(String(i))
    if (on(12) || moveY < -0.55) held.add('up')
    if (on(13) || moveY > 0.55) held.add('down')
    const press = (key) => enabled && !this.suspended && !changed && held.has(key) && !this.held.has(key)
    const result = {
      connected: true, active: moving(pad), moveX, moveY, lookX, lookY,
      zoom: (pad.buttons[6]?.value ?? 0) - (pad.buttons[7]?.value ?? 0),
      sprint: on(10), interact: press('0'), cancel: press('1'), action: press('2'),
      rotateLeft: press('4'), rotateRight: press('5'), help: press('9'),
      up: press('up'), down: press('down'),
    }
    // La croix complète le stick sans accélérer les diagonales.
    const dx = Number(on(15)) - Number(on(14)), dy = Number(on(13)) - Number(on(12))
    if (dx || dy) {
      const length = Math.hypot(dx, dy)
      result.moveX = dx / length
      result.moveY = dy / length
    }
    this.held = held
    this.suspended = false
    return enabled ? result : neutral(true)
  }
}
