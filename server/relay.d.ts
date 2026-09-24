import type { Server } from 'node:http'
import type { WebSocketServer } from 'ws'

export function attachRelay(httpServer: Server, options?: { log?: (message: string) => void; secret?: string }): WebSocketServer
