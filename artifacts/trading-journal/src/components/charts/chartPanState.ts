/**
 * Per-chart vertical pan lock state.
 * Each mounted CustomChart gets its own scope so a gesture in one
 * layout pane cannot change the autoscale range of sibling panes.
 */
export type PanRange = { lo: number; hi: number } | null;
type Listener = (range: PanRange) => void;

const currentByScope = new Map<string, PanRange>();
const listenersByScope = new Map<string, Set<Listener>>();

export function getPanRange(scope = "main"): PanRange {
  return currentByScope.get(scope) ?? null;
}

export function activatePanRange(range: PanRange, scope = "main"): void {
  currentByScope.set(scope, range);
  const listeners = listenersByScope.get(scope);
  if (listeners) {
    for (const listener of listeners) listener(range);
  }
}

export function updatePanRange(lo: number, hi: number, scope = "main"): void {
  currentByScope.set(scope, { lo, hi });
}

export function subscribePanRange(listener: Listener, scope = "main"): () => void {
  let listeners = listenersByScope.get(scope);
  if (!listeners) {
    listeners = new Set<Listener>();
    listenersByScope.set(scope, listeners);
  }
  listeners.add(listener);

  return () => {
    listeners!.delete(listener);
    if (listeners!.size === 0) listenersByScope.delete(scope);
  };
}
