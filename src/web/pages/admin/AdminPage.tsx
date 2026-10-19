import { useEffect, useState } from 'react';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter';
import { Button } from '../../components/Button.tsx';
import { StateView } from '../../components/StateView.tsx';
import { copy } from '../../content/copy.ts';
import { api, ApiError } from '../../lib/api.ts';
import type { AuthUser } from '../../../shared/contracts.ts';
import { AdminContext } from './AdminContext.ts';
import { CountersSection } from './CountersSection.tsx';
import { PosterSection } from './PosterSection.tsx';
import { ServicesSection } from './ServicesSection.tsx';
import { SettingsSection } from './SettingsSection.tsx';
import { UsersSection } from './UsersSection.tsx';
import { genericMessage } from './useApi.ts';
import styles from './admin.module.css';

type Guard = { status: 'checking' } | { status: 'error'; message: string } | { status: 'ok'; user: AuthUser };

const NAV = [
  { href: '/admin', label: copy.admin.nav.settings },
  { href: '/admin/services', label: copy.admin.nav.services },
  { href: '/admin/counters', label: copy.admin.nav.counters },
  { href: '/admin/users', label: copy.admin.nav.users },
  { href: '/admin/poster', label: copy.admin.nav.poster },
] as const;

export function AdminPage() {
  const [, navigate] = useLocation();
  const [guard, setGuard] = useState<Guard>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<{ user: AuthUser }>('/api/auth/me', controller.signal)
      .then(({ user }) => {
        if (user.role !== 'admin') navigate('/staff', { replace: true });
        else setGuard({ status: 'ok', user });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) navigate('/login', { replace: true });
        else setGuard({ status: 'error', message: genericMessage(error) });
      });
    return () => controller.abort();
  }, [attempt, navigate]);

  if (guard.status === 'ok') {
    return (
      <AdminContext.Provider value={{ user: guard.user }}>
        <AdminShell />
      </AdminContext.Provider>
    );
  }

  return (
    <main className={styles.content}>
      {guard.status === 'checking' ? (
        <StateView kind="loading" message={copy.states.loading} />
      ) : (
        <StateView
          kind="error"
          title={copy.admin.title}
          message={guard.message}
          retryLabel={copy.common.retry}
          onRetry={() => {
            setGuard({ status: 'checking' });
            setAttempt((n) => n + 1);
          }}
        />
      )}
    </main>
  );
}

function AdminShell() {
  const [location, navigate] = useLocation();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    try {
      await api.post('/api/auth/logout');
    } catch {
      // The session cookie may already be gone; the login page is the right place either way.
    }
    navigate('/login?loggedOut=1');
  }

  return (
    <>
      <header className={`${styles.header} ${styles.noPrint}`}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.wordmark}>{copy.app.name}</span>
            <span className={styles.brandTitle}>{copy.admin.title}</span>
          </div>
          <div className={styles.headerLinks}>
            <Link href="/staff" className={styles.headerLink}>
              {copy.admin.staffPanelLink}
            </Link>
            <Link href="/display" className={styles.headerLink}>
              {copy.admin.displayLink}
            </Link>
            <Button variant="quiet" busy={leaving} onClick={() => void logout()}>
              {leaving ? copy.common.loggingOut : copy.common.logout}
            </Button>
          </div>
        </div>
      </header>
      <nav aria-label={copy.admin.navLabel} className={`${styles.nav} ${styles.noPrint}`}>
        <ul className={styles.navList}>
          {NAV.map((item) => {
            const current = item.href === '/admin' ? location === '/admin' || location === '/admin/' : location.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.navLink} ${current ? styles.navLinkCurrent : ''}`}
                  aria-current={current ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <main className={styles.content}>
        <Switch>
          <Route path="/admin/services" component={ServicesSection} />
          <Route path="/admin/counters" component={CountersSection} />
          <Route path="/admin/users" component={UsersSection} />
          <Route path="/admin/poster" component={PosterSection} />
          <Route path="/admin" component={SettingsSection} />
          <Route>
            <Redirect to="/admin" replace />
          </Route>
        </Switch>
      </main>
    </>
  );
}
