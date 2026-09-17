/**
 * Coordinates storefront cart operations across concurrent additions.
 * Uses the native Web Locks API (`navigator.locks.request`) when available.
 * Falls back to an in-memory sequential promise queue in environments
 * lacking Web Locks (e.g. mobile in-app WebViews, older Safari).
 */
let inMemoryLockQueue: Promise<unknown> = Promise.resolve();

export async function withBundleCartLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function') {
    return navigator.locks.request('only-bundles-cart', { mode: 'exclusive' }, operation);
  }

  const previousQueue = inMemoryLockQueue;
  let releaseLock: () => void;
  inMemoryLockQueue = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousQueue.catch(() => {});
    return await operation();
  } finally {
    releaseLock!();
  }
}
