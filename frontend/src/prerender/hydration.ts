// What a prerendered page knew when it was built, so the browser draws exactly the same HTML while React
// takes it over (hydration), then updates what differs. See docs/page-speed.md.
// - useHydrated: false while prerendering and hydrating, true afterwards.
// - useNow: the build time while prerendering and hydrating, then the real time, updated each minute.
import { useMemo, useSyncExternalStore } from 'react';

const MINUTE = 60_000;
const toMinute = (ms: number) => Math.floor(ms / MINUTE) * MINUTE;

/** Set by the prerender step before it renders; in the browser, read from the prerendered #root. */
let buildTime: number | null = null;

export function setPrerenderTime(ms: number | null) {
  buildTime = ms === null ? null : toMinute(ms);
}

function prerenderTime(): number {
  if (buildTime !== null) return buildTime;
  const fromPage = typeof document === 'undefined' ? NaN : Number(document.getElementById('root')?.dataset['renderedAt']);
  return Number.isFinite(fromPage) && fromPage > 0 ? toMinute(fromPage) : toMinute(Date.now());
}

const nothingToUnsubscribe = () => undefined;
const noSubscription = () => nothingToUnsubscribe;

export const useHydrated = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

function subscribeToMinutes(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const next = () => {
    timer = setTimeout(() => {
      onChange();
      next();
    }, MINUTE - (Date.now() % MINUTE));
  };
  next();
  return () => {
    clearTimeout(timer);
  };
}

/** The current time to the minute. Prerendered pages and their hydration use the build time. */
export function useNow(): Date {
  const ms = useSyncExternalStore(subscribeToMinutes, () => toMinute(Date.now()), prerenderTime);
  return useMemo(() => new Date(ms), [ms]);
}
