/**
 * Shared vertical-pan range for the main chart pane.
 *
 * WHY: LWC unions the autoscaleInfoProvider results from ALL series in a
 * pane to determine the visible price range. If overlay indicators (EMA,
 * SMA…) don't match the candlestick's locked range, LWC expands the view
 * to include their natural data range, making vertical pan feel "limited".
 *
 * HOW: CustomChart calls activatePanRange / updatePanRange as it pans.
 * IndicatorRenderer / CustomIndicatorRenderer subscribe and apply the same
 * autoscaleInfoProvider to their pane-0 series so the union = locked range.
 */

export type PanRange = { lo: number; hi: number } | null;
type Listener = (r: PanRange) => void;
const _currentByScope = new Map<string, PanRange>();
const _listenersByScope = new Map<string, Set<Listener>>();

/** Read the current pan range for one chart instance. */
export function getPanRange(scope = "main"): PanRange {
  return _currentByScope.get(scope) ?? null;
}

/**
 * Set range AND notify subscribers.
 * Call on pan START (first vertical frame) and pan END (lift / coast end).
 */
export function activatePanRange(r: PanRange, scope = "main"): void {
  _currentByScope.set(scope, r);
  const listeners = _listenersByScope.get(scope);
  if (listeners) for (const fn of listeners) fn(r);
}

/**
 * Update the stored range WITHOUT notifying subscribers.
 * Call on every subsequent RAF frame — providers already installed on series
 * will read the new value dynamically via getPanRange().
 */
export function updatePanRange(lo: number, hi: number, scope = "main"): void {
  _currentByScope.set(scope, { lo, hi });
}

/** Subscribe to activate / deactivate events. Returns unsubscribe fn. */
export function subscribePanRange(fn: Listener, scope = "main"): () => void {
  let listeners = _listenersByScope.get(scope);
  if (!listeners) { listeners = new Set<Listener>(); _listenersByScope.set(scope, listeners); }
  listeners.add(fn);
  return () => {
    listeners!.delete(fn);
    if (listeners!.size === 0) _listenersByScope.delete(scope);
  };
}
