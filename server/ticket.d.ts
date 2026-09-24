export function verifyTicket(ticket: unknown, secret: string, now?: number): { name: string; key: string } | null
export function issueTicket(name: string, secret: string, ttl?: number): string
