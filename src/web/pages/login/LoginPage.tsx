import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { PasswordField } from '../../components/PasswordField.tsx';
import { TextField } from '../../components/TextField.tsx';
import { copy } from '../../content/copy.ts';
import { api } from '../../lib/api.ts';
import type { AuthUser } from '../../../shared/contracts.ts';
import styles from './login.module.css';

const t = copy.login;
const DEFAULT_WAIT_S = 60;

type Failure = 'invalid' | 'rate' | 'network' | 'server';

type LoginResult = { ok: true; user: AuthUser } | { ok: false; failure: Failure; retryAfterSeconds: number };

// api.post hides response headers, and the 429 wait lives in Retry-After, so login talks to fetch directly.
async function requestLogin(username: string, password: string): Promise<LoginResult> {
  let response: Response;
  try {
    response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return { ok: false, failure: 'network', retryAfterSeconds: 0 };
  }
  if (response.ok) {
    const body = (await response.json()) as { user: AuthUser };
    return { ok: true, user: body.user };
  }
  if (response.status === 401) return { ok: false, failure: 'invalid', retryAfterSeconds: 0 };
  if (response.status === 429) {
    const header = Number(response.headers.get('Retry-After'));
    return { ok: false, failure: 'rate', retryAfterSeconds: Number.isFinite(header) && header > 0 ? header : DEFAULT_WAIT_S };
  }
  return { ok: false, failure: 'server', retryAfterSeconds: 0 };
}

export function LoginPage() {
  const [, navigate] = useLocation();
  const search = new URLSearchParams(useSearch());
  const expired = search.has('expired');
  const loggedOut = search.has('loggedOut');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState({ until: 0, username: '', text: '' });
  const [now, setNow] = useState(() => Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    document.title = copy.app.pageTitle(t.docTitle);
  }, []);

  // Someone who is already signed in has no use for the form.
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<{ user: AuthUser }>('/api/auth/me', controller.signal)
      .then(({ user }) => navigate(user.role === 'admin' ? '/admin' : '/staff', { replace: true }))
      .catch(() => {
        // Anonymous or unreachable: stay on the form.
      });
    return () => controller.abort();
  }, [navigate]);

  useEffect(() => {
    const until = wait.until;
    if (until <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [wait.until]);

  // Focus the first field that failed, after the errors have rendered.
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  // The server limits attempts per username, so only the blocked username has to wait.
  const waiting = now < wait.until && username.trim().toLowerCase() === wait.username;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || waiting) return;
    const found: { username?: string; password?: string } = {};
    if (username.trim() === '') found.username = t.usernameRequired;
    if (password === '') found.password = t.passwordRequired;
    setErrors(found);
    if (found.username || found.password) {
      setFocusTick((n) => n + 1);
      return;
    }

    setBusy(true);
    setFailure(null);
    const result = await requestLogin(username.trim(), password);
    setBusy(false);
    if (result.ok) {
      navigate(result.user.role === 'admin' ? '/admin' : '/staff', { replace: true });
      return;
    }
    setFailure(result.failure);
    if (result.failure === 'rate') {
      const current = Date.now();
      setNow(current);
      setWait({
        until: current + result.retryAfterSeconds * 1000,
        username: username.trim().toLowerCase(),
        text: t.rateLimitedWait(result.retryAfterSeconds),
      });
    }
    if (result.failure === 'invalid') setPassword('');
  }

  return (
    <main className={styles.page}>
      <p className={styles.wordmark}>{copy.app.name}</p>
      <div className={styles.head}>
        <h1>{t.title}</h1>
        <p className={styles.lead}>{t.lead}</p>
      </div>

      <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        {failure === 'invalid' && <Banner variant="error" title={t.invalid} />}
        {waiting && <Banner variant="error" title={wait.text} />}
        {failure === 'network' && <Banner variant="error" title={copy.states.networkError} />}
        {failure === 'server' && <Banner variant="error" title={copy.states.serverError} />}
        {failure === null && expired && <Banner variant="info" title={t.sessionExpired} />}
        {failure === null && loggedOut && !expired && <Banner variant="success" title={t.loggedOut} />}

        <TextField
          label={t.username}
          error={errors.username}
          value={username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => setUsername(event.target.value)}
        />
        <PasswordField
          label={t.password}
          error={errors.password}
          value={password}
          autoComplete="current-password"
          showText={copy.common.showPassword}
          hideText={copy.common.hidePassword}
          showLabel={copy.common.showPasswordLabel}
          hideLabel={copy.common.hidePasswordLabel}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" fullWidth busy={busy} disabled={waiting}>
          {busy ? t.submitting : t.submit}
        </Button>
      </form>

      <div className={styles.below}>
        <p className={styles.forgot}>{t.forgot}</p>
        <p>
          {t.visitorPrompt} <Link href="/take">{t.visitorLink}</Link>
        </p>
      </div>
    </main>
  );
}
