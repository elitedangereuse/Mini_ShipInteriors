type Pad = Pick<Gamepad, 'index' | 'connected' | 'mapping' | 'axes' | 'buttons'>

export interface GamepadInput {
  connected: boolean
  active: boolean
  moveX: number
  moveY: number
  lookX: number
  lookY: number
  zoom: number
  sprint: boolean
  interact: boolean
  action: boolean
  cancel: boolean
  rotateLeft: boolean
  rotateRight: boolean
  help: boolean
  up: boolean
  down: boolean
}

export class GamepadControls {
  constructor(read?: () => readonly (Pad | null)[])
  suspend(): void
  poll(enabled?: boolean): GamepadInput
}
