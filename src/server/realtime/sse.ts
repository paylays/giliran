import type { Hub, Topic } from './hub.ts';

export const PING_INTERVAL_MS = 15_000;
export const RETRY_MS = 3000;
// Chunks queued beyond this mean the client is not reading; the stream ends and the client reconnects.
export const MAX_BACKLOG = 16;

export interface StreamSource {
  topic: Topic;
  // Current view state, or null when the stream must end (for example the session is gone).
  snapshot(): unknown;
  // Checked on every ping so a revoked session does not keep a stream open.
  alive?(): boolean;
}

const encoder = new TextEncoder();

export function sseResponse(req: Request, hub: Hub, now: () => number, source: StreamSource): Response {
  let end: () => void = () => {};

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => {};
      let pingTimer: NodeJS.Timeout | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (pingTimer) clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          // Already cancelled by the client.
        }
      };
      end = close;

      const write = (text: string) => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) < -MAX_BACKLOG) {
          close();
          return;
        }
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };

      const push = () => {
        const snap = source.snapshot();
        if (snap === null) close();
        else write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
      };

      write(`retry: ${RETRY_MS}\n\n`);
      unsubscribe = hub.subscribe(source.topic, push);
      push();

      // A named event rather than a comment, so the client watchdog sees it.
      pingTimer = setInterval(() => {
        if (source.alive && !source.alive()) close();
        else write(`event: ping\ndata: ${JSON.stringify({ serverTime: now() })}\n\n`);
      }, PING_INTERVAL_MS);

      req.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      end();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
