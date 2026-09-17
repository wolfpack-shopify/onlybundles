import { withBundleCartLock } from '../../../app/lib/bundle-cart-lock';

describe('bundle cart lock', () => {
  it('holds the shared exclusive lock until the entire addition finishes when native locks available', async () => {
    const events: string[] = [];
    const request = jest.fn(async (_name, _options, operation) => {
      events.push('locked');
      await operation();
      events.push('released');
    });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request } } });

    await withBundleCartLock(async () => {
      events.push('write');
      await Promise.resolve();
      events.push('add');
    });

    expect(events).toEqual(['locked', 'write', 'add', 'released']);
    expect(request).toHaveBeenCalledWith('only-bundles-cart', { mode: 'exclusive' }, expect.any(Function));
  });

  it('executes successfully via in-memory queue when navigator.locks is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const operation = jest.fn().mockResolvedValue('added');

    const result = await withBundleCartLock(operation);

    expect(result).toBe('added');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('coordinates concurrent operations sequentially when navigator.locks is absent', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
    const executionOrder: string[] = [];

    const op1 = withBundleCartLock(async () => {
      executionOrder.push('op1_start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      executionOrder.push('op1_end');
      return 1;
    });

    const op2 = withBundleCartLock(async () => {
      executionOrder.push('op2_start');
      executionOrder.push('op2_end');
      return 2;
    });

    const [res1, res2] = await Promise.all([op1, op2]);

    expect(res1).toBe(1);
    expect(res2).toBe(2);
    expect(executionOrder).toEqual(['op1_start', 'op1_end', 'op2_start', 'op2_end']);
  });

  it('propagates errors from failing operations without blocking subsequent calls', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    const failingOp = withBundleCartLock(async () => {
      throw new Error('Network failure');
    });

    await expect(failingOp).rejects.toThrow('Network failure');

    const nextOp = withBundleCartLock(async () => 'recovered');
    await expect(nextOp).resolves.toBe('recovered');
  });
});
