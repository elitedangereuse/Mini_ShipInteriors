/*
 * Ce que des navigateurs encore en circulation n'ont pas (importé en premier par main.ts).
 */

// `AbortSignal.timeout()` manque avant Safari 16 (iOS 15) : chaque demande au site levait une
// exception avant même de partir, et le jeu croyait le site injoignable.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Délai dépassé', 'TimeoutError')), ms)
    return controller.signal
  }
}
