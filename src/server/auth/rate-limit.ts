// In-memory sliding window of recorded failures per key.
export interface FailureLimiter {
  // Seconds until the key may try again, or 0 when it is not blocked.
  blockedFor(key: string): number;
  fail(key: string): void;
  reset(key: string): void;
}

export function createFailureLimiter(opts: { max: number; windowMs: number; now: () => number }): FailureLimiter {
  const hits = new Map<string, number[]>();

  function live(key: string): number[] {
    const cutoff = opts.now() - opts.windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length > 0) hits.set(key, recent);
    else hits.delete(key);
    return recent;
  }

  return {
    blockedFor(key) {
      const recent = live(key);
      if (recent.length < opts.max) return 0;
      const oldest = recent[0] ?? opts.now();
      return Math.max(1, Math.ceil((oldest + opts.windowMs - opts.now()) / 1000));
    },
    fail(key) {
      const recent = live(key);
      recent.push(opts.now());
      hits.set(key, recent);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
