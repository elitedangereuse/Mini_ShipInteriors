import type { Server as HttpServer } from 'node:http'
import type { Server } from 'socket.io'

export const WS_PATH: string
export function attachRelay(
  httpServer: HttpServer,
  options?: { log?: (message: string) => void; error?: (message: string) => void; cmdrUrl?: string; path?: string; devCmdr?: boolean;
    youtubeKey?: string; youtubeFetch?: typeof fetch; relaySecret?: string; salvageFetch?: typeof fetch },
): Server
