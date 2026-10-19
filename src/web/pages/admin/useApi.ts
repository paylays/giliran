import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { copy } from '../../content/copy.ts';
import { api, ApiError } from '../../lib/api.ts';

/** Message for a failure that has no screen-specific meaning. */
export function genericMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return copy.states.networkError;
    if (error.status === 401) return copy.states.sessionExpired;
    if (error.status === 403) return copy.states.forbidden;
    if (error.status === 429) return copy.states.rateLimited;
  }
  return copy.states.serverError;
}

/**
 * Returns a function that turns any failure into a message. A 401 also sends the user
 * to the login page, because the session ended while the page was open.
 */
export function useFailure(): (error: unknown) => string {
  const [, navigate] = useLocation();
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) navigate('/login?expired=1', { replace: true });
      return genericMessage(error);
    },
    [navigate],
  );
}

export type Resource<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

/**
 * GET a path and keep the result. `refresh` fetches again without showing the loading state,
 * `retry` goes back through it.
 */
export function useResource<T>(path: string): {
  state: Resource<T>;
  refresh: () => void;
  retry: () => void;
  set: (data: T) => void;
} {
  const fail = useFailure();
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<T>(path, controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: fail(error) });
      });
    return () => controller.abort();
  }, [path, tick, fail]);

  return {
    state,
    refresh: () => setTick((n) => n + 1),
    retry: () => {
      setState({ status: 'loading' });
      setTick((n) => n + 1);
    },
    set: (data) => setState({ status: 'ready', data }),
  };
}

interface Issue {
  path: string;
  message: string;
}

/** The server's zod issues from a 400 body, or an empty list. */
export function issuesOf(error: unknown): Issue[] {
  if (!(error instanceof ApiError) || error.code !== 'invalid_request') return [];
  const body = error.body as { issues?: unknown } | null;
  if (!body || !Array.isArray(body.issues)) return [];
  return body.issues.filter(
    (item): item is Issue =>
      typeof item === 'object' && item !== null && typeof (item as Issue).path === 'string' && typeof (item as Issue).message === 'string',
  );
}

/** True when a zod issue message says a string or number was over its limit. */
export function isTooBig(message: string): boolean {
  return /too big|<=|at most/i.test(message);
}
