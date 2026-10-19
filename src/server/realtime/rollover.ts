import type { Db } from '../db/client.ts';
import { closeStaleCalls } from '../domain/tickets.ts';
import { getSettings } from '../domain/settings.ts';
import { businessDate, msUntilNextBusinessDay } from '../../shared/business-date.ts';
import type { Hub } from './hub.ts';

const MAX_WAIT_MS = 30_000;

interface RolloverDeps {
  db: Db;
  now: () => number;
  hub: Hub;
}

// Detects the business-day change, closes stale calls, and refreshes every view once.
export function createRollover({ db, now, hub }: RolloverDeps) {
  let lastDate = businessDate(now(), getSettings(db).timezone);

  return {
    tick(): boolean {
      const date = businessDate(now(), getSettings(db).timezone);
      if (date === lastDate) return false;
      lastDate = date;
      closeStaleCalls(db, now());
      hub.notifyAll();
      return true;
    },
    // Aim just past local midnight; re-check at least every 30 s to catch DST or a timezone edit.
    nextDelayMs(): number {
      const untilMidnight = msUntilNextBusinessDay(now(), getSettings(db).timezone) + 100;
      return Math.min(MAX_WAIT_MS, untilMidnight);
    },
  };
}

export function startRollover(deps: RolloverDeps): () => void {
  const rollover = createRollover(deps);
  let timer: NodeJS.Timeout;
  const loop = () => {
    try {
      rollover.tick();
    } catch (err) {
      console.error('rollover check failed', err);
    }
    timer = setTimeout(loop, rollover.nextDelayMs());
    timer.unref();
  };
  timer = setTimeout(loop, rollover.nextDelayMs());
  timer.unref();
  return () => clearTimeout(timer);
}
