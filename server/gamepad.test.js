import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GamepadControls } from '../shared/gamepad.js'

function pad(index = 0) {
  return {
    index, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  }
}
function button(p, index, pressed) {
  p.buttons[index] = { pressed, value: Number(pressed) }
}

test('zone morte radiale, vitesse progressive et diagonales limitées', () => {
  const p = pad(), controls = new GamepadControls(() => [p])
  p.axes = [0.1, -0.1, 0.1, 0.1]
  let input = controls.poll()
  assert.equal(input.active, false)
  assert.equal(input.moveX, 0)
  assert.equal(input.lookY, 0)
  p.axes = [0.5, 0, 0, -1]
  input = controls.poll()
  assert.ok(input.moveX > 0 && input.moveX < 0.5)
  assert.equal(input.lookY, -1)
  p.axes = [1, -1, 0, 0]
  input = controls.poll()
  assert.ok(Math.abs(Math.hypot(input.moveX, input.moveY) - 1) < 1e-10)
})

test('actions au nouvel appui ; course et gâchettes maintenues', () => {
  const p = pad(), controls = new GamepadControls(() => [p])
  for (const i of [0, 1, 2, 4, 5, 9, 10]) button(p, i, true)
  p.buttons[7].value = 0.7
  let input = controls.poll()
  for (const action of ['interact', 'cancel', 'action', 'rotateLeft', 'rotateRight', 'help']) assert.equal(input[action], true)
  assert.equal(input.sprint, true)
  assert.equal(input.zoom, -0.7)
  input = controls.poll()
  for (const action of ['interact', 'cancel', 'action', 'rotateLeft', 'rotateRight', 'help']) assert.equal(input[action], false)
  assert.equal(input.sprint, true)
  button(p, 0, false)
  controls.poll()
  button(p, 0, true)
  assert.equal(controls.poll().interact, true)
})

test('croix normalisée et navigation par impulsions du stick ou de la croix', () => {
  const p = pad(), controls = new GamepadControls(() => [p])
  button(p, 12, true); button(p, 15, true)
  let input = controls.poll()
  assert.equal(input.up, true)
  assert.ok(input.moveX > 0 && input.moveY < 0)
  assert.ok(Math.abs(Math.hypot(input.moveX, input.moveY) - 1) < 1e-10)
  assert.equal(controls.poll().up, false)
  button(p, 12, false); button(p, 15, false)
  controls.poll()
  p.axes[1] = 1
  assert.equal(controls.poll().down, true)
  assert.equal(controls.poll().down, false)
  p.axes[1] = 0
  controls.poll()
  p.axes[1] = 1
  assert.equal(controls.poll().down, true)
})

test('saisie, perte de focus : aucune action différée au retour', () => {
  const p = pad(), controls = new GamepadControls(() => [p])
  button(p, 0, true); p.axes[0] = 1
  let input = controls.poll(false)
  assert.equal(input.moveX, 0)
  assert.equal(input.interact, false)
  assert.equal(input.active, false)
  assert.equal(controls.poll().interact, false)
  button(p, 0, false)
  controls.poll()
  controls.suspend()
  button(p, 0, true)
  assert.equal(controls.poll().interact, false)
  button(p, 0, false)
  controls.poll()
  button(p, 0, true)
  assert.equal(controls.poll().interact, true)
})

test('déconnexion, manettes non standard et API indisponible', () => {
  const p = pad()
  let pads = [null, p]
  const controls = new GamepadControls(() => pads)
  p.axes[0] = 1
  assert.equal(controls.poll().moveX, 1)
  p.connected = false
  assert.equal(controls.poll().connected, false)
  p.connected = true; p.mapping = ''
  assert.equal(controls.poll().connected, false)
  pads = []
  assert.equal(controls.poll().moveX, 0)
  assert.equal(new GamepadControls(() => { throw new Error('API bloquée') }).poll().connected, false)
})

test('la manette utilisée prend la main sans rejouer un bouton tenu lors du changement', () => {
  const a = pad(0), b = pad(2), controls = new GamepadControls(() => [a, null, b])
  controls.poll()
  button(b, 0, true); b.axes[0] = -1
  assert.equal(controls.poll().interact, false)
  assert.equal(controls.poll().moveX, -1)
  button(b, 0, false)
  controls.poll()
  button(b, 0, true)
  assert.equal(controls.poll().interact, true)
})
