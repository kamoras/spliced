// Fire-and-forget custom events for the (optional) Umami script loaded in
// index.html. A no-op when it's blocked or absent.

type Umami = { track: (event: string, data?: Record<string, unknown>) => void };

export function track(event: string, data?: Record<string, unknown>): void {
  try {
    (window as unknown as { umami?: Umami }).umami?.track(event, data);
  } catch {
    /* analytics must never break the game */
  }
}
