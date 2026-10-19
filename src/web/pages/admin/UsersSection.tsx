import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { PasswordField } from '../../components/PasswordField.tsx';
import { Select } from '../../components/Select.tsx';
import { StateView } from '../../components/StateView.tsx';
import { TextField } from '../../components/TextField.tsx';
import { copy } from '../../content/copy.ts';
import { api, ApiError } from '../../lib/api.ts';
import type { UserDto } from '../../../shared/contracts.ts';
import { useAdminUser } from './AdminContext.ts';
import { FocusBanner } from './FocusBanner.tsx';
import { SectionHead } from './SectionHead.tsx';
import { isTooBig, issuesOf, useFailure, useResource } from './useApi.ts';
import { useDocTitle } from './useDocTitle.ts';
import styles from './admin.module.css';

const t = copy.admin.users;
const MIN_PASSWORD = 8;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function UsersSection() {
  useDocTitle(t.title);
  const fail = useFailure();
  const me = useAdminUser();
  const { state, retry, refresh } = useResource<{ users: UserDto[] }>('/api/admin/users');
  const [form, setForm] = useState({ nonce: 0, open: false });
  const [reset, setReset] = useState<{ user: UserDto; nonce: number; open: boolean } | null>(null);
  const [toDeactivate, setToDeactivate] = useState<UserDto | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);

  async function setActive(user: UserDto, active: boolean) {
    setBusyId(user.id);
    setActionError(null);
    setResetDone(null);
    try {
      await api.patch(`/api/admin/users/${user.id}`, { active });
      refresh();
    } catch (error) {
      setActionError(
        error instanceof ApiError && error.code === 'cannot_deactivate_self' ? t.cannotDeactivateSelf : fail(error),
      );
    } finally {
      setBusyId(null);
      setToDeactivate(null);
    }
  }

  const head = (
    <SectionHead
      title={t.title}
      lead={t.lead}
      action={<Button onClick={() => setForm((current) => ({ nonce: current.nonce + 1, open: true }))}>{t.add}</Button>}
    />
  );

  if (state.status === 'loading') {
    return (
      <div className={styles.stack}>
        {head}
        <StateView kind="loading" message={t.loading} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={styles.stack}>
        {head}
        <StateView kind="error" title={t.loadError} message={state.message} retryLabel={copy.common.retry} onRetry={retry} />
      </div>
    );
  }

  const users = state.data.users;
  const others = users.filter((user) => user.id !== me.id);

  return (
    <div className={styles.stack}>
      {head}
      {resetDone && <Banner variant="success" title={resetDone} />}
      {actionError && (
        <Banner variant="error" title={copy.admin.actionFailedTitle}>
          <p>{actionError}</p>
        </Banner>
      )}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t.colName}</th>
            <th scope="col">{t.colUsername}</th>
            <th scope="col">{t.colRole}</th>
            <th scope="col">{t.colStatus}</th>
            <th scope="col">{t.colActions}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const self = user.id === me.id;
            const blocked = busyId !== null;
            return (
              <tr key={user.id} className={user.active ? undefined : styles.inactiveRow}>
                <td className={styles.cellName}>{self ? `${user.displayName} ${copy.common.youSuffix}` : user.displayName}</td>
                <td data-label={t.colUsername}>{user.username}</td>
                <td data-label={t.colRole}>{user.role === 'admin' ? t.roleAdmin : t.roleStaff}</td>
                <td data-label={t.colStatus} className={user.active ? undefined : styles.cellMuted}>
                  {user.active ? copy.common.active : copy.common.inactive}
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <Button
                      variant="quiet"
                      disabled={blocked}
                      aria-label={`${t.resetPassword}: ${user.displayName}`}
                      onClick={() => {
                        setResetDone(null);
                        setReset((current) => ({ user, nonce: (current?.nonce ?? 0) + 1, open: true }));
                      }}
                    >
                      {t.resetPassword}
                    </Button>
                    {!self &&
                      (user.active ? (
                        <Button
                          variant="quiet"
                          disabled={blocked}
                          aria-label={`${copy.common.deactivate}: ${user.displayName}`}
                          onClick={() => setToDeactivate(user)}
                        >
                          {copy.common.deactivate}
                        </Button>
                      ) : (
                        <Button
                          variant="quiet"
                          disabled={blocked}
                          aria-label={`${copy.common.activate}: ${user.displayName}`}
                          onClick={() => void setActive(user, true)}
                        >
                          {copy.common.activate}
                        </Button>
                      ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {others.length === 0 && <StateView kind="empty" message={t.empty} />}

      <CreateUserForm
        key={`create-${form.nonce}`}
        open={form.open}
        onClose={() => setForm((current) => ({ ...current, open: false }))}
        onSaved={() => {
          setForm((current) => ({ ...current, open: false }));
          setResetDone(null);
          refresh();
        }}
      />

      {reset && (
        <ResetPasswordForm
          key={`reset-${reset.nonce}`}
          open={reset.open}
          user={reset.user}
          onClose={() => setReset((current) => (current ? { ...current, open: false } : current))}
          onDone={() => {
            setResetDone(t.resetDone(reset.user.displayName));
            setReset((current) => (current ? { ...current, open: false } : current));
          }}
        />
      )}

      <ConfirmDialog
        open={toDeactivate !== null}
        title={t.deactivateTitle(toDeactivate?.displayName ?? '')}
        body={t.deactivateBody}
        cancelLabel={copy.common.cancel}
        confirmLabel={t.deactivateButton(toDeactivate?.displayName ?? '')}
        destructive
        busy={busyId !== null}
        busyLabel={copy.common.saving}
        onCancel={() => setToDeactivate(null)}
        onConfirm={() => toDeactivate && void setActive(toDeactivate, false)}
      />
    </div>
  );
}

type CreateErrors = { displayName?: string; username?: string; password?: string };

function CreateUserForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const fail = useFailure();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [errors, setErrors] = useState<CreateErrors>({});
  const [summary, setSummary] = useState<{ text: string; attempt: number } | null>(null);
  const [busy, setBusy] = useState(false);

  function reject(found: CreateErrors, text: string) {
    setErrors(found);
    setSummary((current) => ({ text, attempt: (current?.attempt ?? 0) + 1 }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found: CreateErrors = {};
    const name = displayName.trim();
    const login = username.trim().toLowerCase();
    if (name === '') found.displayName = copy.common.required(t.displayName);
    else if (name.length > 80) found.displayName = copy.common.maxLength(80);
    if (!USERNAME_PATTERN.test(login)) found.username = t.usernameInvalid;
    if (password.length < MIN_PASSWORD) found.password = copy.common.minLength(MIN_PASSWORD);
    else if (password.length > 256) found.password = copy.common.maxLength(256);
    if (Object.keys(found).length > 0) {
      reject(found, copy.common.fieldErrorsSummary);
      return;
    }

    setBusy(true);
    try {
      await api.post('/api/admin/users', { username: login, displayName: name, password, role });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'username_taken') {
        reject({ username: t.usernameTaken }, copy.common.fieldErrorsSummary);
      } else if (error instanceof ApiError && error.status === 400) {
        const mapped: CreateErrors = {};
        for (const issue of issuesOf(error)) {
          if (issue.path === 'username') mapped.username = t.usernameInvalid;
          if (issue.path === 'displayName') {
            mapped.displayName = isTooBig(issue.message) ? copy.common.maxLength(80) : copy.common.required(t.displayName);
          }
          if (issue.path === 'password') {
            mapped.password = isTooBig(issue.message) ? copy.common.maxLength(256) : copy.common.minLength(MIN_PASSWORD);
          }
        }
        reject(mapped, copy.common.fieldErrorsSummary);
      } else {
        reject({}, fail(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="wide"
      title={t.addTitle}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.common.cancel}
          </Button>
          <Button type="submit" form="user-form" busy={busy}>
            {busy ? copy.common.saving : t.submit}
          </Button>
        </>
      }
    >
      <form id="user-form" className={styles.dialogForm} onSubmit={(event) => void submit(event)} noValidate>
        {summary && <FocusBanner key={summary.attempt} variant="error" title={summary.text} />}
        <TextField
          label={t.displayName}
          hint={t.displayNameHint}
          error={errors.displayName}
          value={displayName}
          data-autofocus
          autoComplete="off"
          onChange={(event) => {
            setDisplayName(event.target.value);
            setErrors((current) => ({ ...current, displayName: undefined }));
          }}
        />
        <TextField
          label={t.username}
          hint={t.usernameHint}
          error={errors.username}
          value={username}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => {
            setUsername(event.target.value);
            setErrors((current) => ({ ...current, username: undefined }));
          }}
        />
        <PasswordField
          label={t.initialPassword}
          hint={t.passwordHint(MIN_PASSWORD)}
          error={errors.password}
          value={password}
          autoComplete="new-password"
          showText={copy.common.showPassword}
          hideText={copy.common.hidePassword}
          showLabel={copy.common.showPasswordLabel}
          hideLabel={copy.common.hidePasswordLabel}
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
        />
        <Select label={t.role} value={role} onChange={(event) => setRole(event.target.value as 'staff' | 'admin')}>
          <option value="staff">{t.roleStaff}</option>
          <option value="admin">{t.roleAdmin}</option>
        </Select>
      </form>
    </Dialog>
  );
}

function ResetPasswordForm({
  open,
  user,
  onClose,
  onDone,
}: {
  open: boolean;
  user: UserDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const fail = useFailure();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [summary, setSummary] = useState<{ text: string; attempt: number } | null>(null);
  const [busy, setBusy] = useState(false);

  function reject(message: string | undefined, text: string) {
    setError(message);
    setSummary((current) => ({ text, attempt: (current?.attempt ?? 0) + 1 }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < MIN_PASSWORD || password.length > 256) {
      reject(
        password.length > 256 ? copy.common.maxLength(256) : copy.common.minLength(MIN_PASSWORD),
        copy.common.fieldErrorsSummary,
      );
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${user.id}/password`, { password });
      onDone();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 400) {
        reject(copy.common.minLength(MIN_PASSWORD), copy.common.fieldErrorsSummary);
      } else {
        reject(undefined, fail(failure));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={t.resetTitle(user.displayName)}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.common.cancel}
          </Button>
          <Button type="submit" form="reset-form" busy={busy}>
            {busy ? copy.common.saving : t.resetSubmit}
          </Button>
        </>
      }
    >
      <form id="reset-form" className={styles.dialogForm} onSubmit={(event) => void submit(event)} noValidate>
        {summary && <FocusBanner key={summary.attempt} variant="error" title={summary.text} />}
        <PasswordField
          label={t.newPassword}
          hint={t.passwordHint(MIN_PASSWORD)}
          error={error}
          value={password}
          data-autofocus
          autoComplete="new-password"
          showText={copy.common.showPassword}
          hideText={copy.common.hidePassword}
          showLabel={copy.common.showPasswordLabel}
          hideLabel={copy.common.hidePasswordLabel}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(undefined);
          }}
        />
      </form>
    </Dialog>
  );
}
