export type Topic =
  | { kind: 'display' }
  | { kind: 'staff' }
  // serviceId is null for an unknown token, which only wakes on notifyAll.
  | { kind: 'ticket'; serviceId: number | null };

export interface Hub {
  subscribe(topic: Topic, push: () => void): () => void;
  // Committed change touching these services. Display and staff views always refresh.
  notify(change: { serviceIds: number[] }): void;
  notifyAll(): void;
  size(): number;
  close(): void;
}

// In-memory pub/sub for one process. Changes inside one batch window cause one push per subscriber.
export function createHub(opts: { batchMs?: number } = {}): Hub {
  const batchMs = opts.batchMs ?? 50;
  const subs = new Set<{ topic: Topic; push: () => void }>();
  const pendingServices = new Set<number>();
  let everything = false;
  let timer: NodeJS.Timeout | null = null;

  function flush() {
    timer = null;
    const all = everything;
    const services = new Set(pendingServices);
    everything = false;
    pendingServices.clear();

    // Copy first: a push may end its stream, which unsubscribes during iteration.
    for (const sub of [...subs]) {
      const { topic } = sub;
      const wanted = all || topic.kind !== 'ticket' || (topic.serviceId !== null && services.has(topic.serviceId));
      if (!wanted) continue;
      try {
        sub.push();
      } catch (err) {
        console.error('hub push failed', err);
      }
    }
  }

  function schedule() {
    timer ??= setTimeout(flush, batchMs);
  }

  return {
    subscribe(topic, push) {
      const sub = { topic, push };
      subs.add(sub);
      return () => {
        subs.delete(sub);
      };
    },
    notify(change) {
      for (const id of change.serviceIds) pendingServices.add(id);
      schedule();
    },
    notifyAll() {
      everything = true;
      schedule();
    },
    size: () => subs.size,
    close() {
      if (timer) clearTimeout(timer);
      timer = null;
      subs.clear();
    },
  };
}
