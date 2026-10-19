import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Checkbox } from '../../components/Checkbox.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { PasswordField } from '../../components/PasswordField.tsx';
import { Select } from '../../components/Select.tsx';
import { StateView } from '../../components/StateView.tsx';
import { TextField } from '../../components/TextField.tsx';
import { copy } from '../../content/copy.ts';
import { api, ApiError } from '../../lib/api.ts';
import type { AdminSettingsDto, SettingsDto, UpdateSettingsBody, WifiSecurity } from '../../../shared/contracts.ts';
import { FocusBanner } from './FocusBanner.tsx';
import { SectionHead } from './SectionHead.tsx';
import { isTooBig, issuesOf, useFailure, useResource } from './useApi.ts';
import { useDocTitle } from './useDocTitle.ts';
import styles from './admin.module.css';

const t = copy.admin.settings;
const ZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;
const OTHER = 'other';

interface FormState {
  businessName: string;
  zoneChoice: string;
  zoneOther: string;
  nearThreshold: string;
  wifiEnabled: boolean;
  wifiSsid: string;
  wifiSecurity: WifiSecurity;
  wifiPassword: string;
}

type Field = keyof FormState | 'zone';
type Errors = Partial<Record<Field, string>>;
type Notice = { kind: 'summary' | 'queue' | 'saved' } | { kind: 'failure'; text: string };

function toForm(settings: SettingsDto): FormState {
  const known = (ZONES as readonly string[]).includes(settings.timezone);
  return {
    businessName: settings.businessName,
    zoneChoice: known ? settings.timezone : OTHER,
    zoneOther: known ? '' : settings.timezone,
    nearThreshold: String(settings.nearThreshold),
    wifiEnabled: settings.wifiSsid !== null,
    wifiSsid: settings.wifiSsid ?? '',
    wifiSecurity: settings.wifiSecurity,
    wifiPassword: settings.wifiPassword ?? '',
  };
}

function zoneOf(form: FormState): string {
  return form.zoneChoice === OTHER ? form.zoneOther.trim() : form.zoneChoice;
}

function validZone(zone: string): boolean {
  if (zone === '') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function validate(form: FormState): Errors {
  const errors: Errors = {};
  const name = form.businessName.trim();
  if (name === '') errors.businessName = copy.common.required(t.businessName);
  else if (name.length > 80) errors.businessName = copy.common.maxLength(80);

  if (form.zoneChoice === OTHER && !validZone(zoneOf(form))) errors.zoneOther = t.timezoneInvalid;

  const near = Number(form.nearThreshold);
  if (form.nearThreshold.trim() === '' || !Number.isInteger(near) || near < 1 || near > 20) {
    errors.nearThreshold = t.nearThresholdInvalid;
  }

  if (form.wifiEnabled) {
    if (form.wifiSsid === '') errors.wifiSsid = t.wifiSsidRequired;
    else if (form.wifiSsid.length > 32) errors.wifiSsid = t.wifiSsidTooLong;

    if (form.wifiSecurity !== 'nopass') {
      const length = form.wifiPassword.length;
      if (length === 0) errors.wifiPassword = t.wifiPasswordRequired;
      else if (length > 63) errors.wifiPassword = t.wifiPasswordTooLong;
      else if (form.wifiSecurity === 'WPA' && length < 8) errors.wifiPassword = t.wifiPasswordWpaLength;
    }
  }
  return errors;
}

// Backup for the client checks: the server's 400 issues map to the same messages.
function serverErrors(error: unknown): Errors {
  const errors: Errors = {};
  for (const issue of issuesOf(error)) {
    const big = isTooBig(issue.message);
    switch (issue.path) {
      case 'businessName':
        errors.businessName = big ? copy.common.maxLength(80) : copy.common.required(t.businessName);
        break;
      case 'timezone':
        errors.zoneOther = t.timezoneInvalid;
        break;
      case 'nearThreshold':
        errors.nearThreshold = t.nearThresholdInvalid;
        break;
      case 'wifiSsid':
        errors.wifiSsid = big ? t.wifiSsidTooLong : t.wifiSsidRequired;
        break;
      case 'wifiPassword':
        errors.wifiPassword = big
          ? t.wifiPasswordTooLong
          : /WPA/.test(issue.message)
            ? t.wifiPasswordWpaLength
            : t.wifiPasswordRequired;
        break;
    }
  }
  return errors;
}

export function SettingsSection() {
  useDocTitle(copy.admin.nav.settings);
  const { state, retry } = useResource<AdminSettingsDto>('/api/admin/settings');

  if (state.status === 'loading') {
    return (
      <div className={styles.stack}>
        <SectionHead title={t.title} />
        <StateView kind="loading" message={t.loading} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={styles.stack}>
        <SectionHead title={t.title} />
        <StateView kind="error" title={t.loadError} message={state.message} retryLabel={copy.common.retry} onRetry={retry} />
      </div>
    );
  }
  return <SettingsForm settings={state.data} />;
}

function SettingsForm({ settings }: { settings: AdminSettingsDto }) {
  const fail = useFailure();
  const [saved, setSaved] = useState(settings);
  const [form, setForm] = useState(() => toForm(settings));
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmZone, setConfirmZone] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    // Editing a field clears its own error; the next submit checks again.
    const errorKey: Field = key === 'zoneChoice' ? 'zoneOther' : key;
    setErrors((current) => (current[errorKey] ? { ...current, [errorKey]: undefined } : current));
  }

  function show(next: Notice) {
    setNotice(next);
    setAttempt((n) => n + 1);
  }

  async function save() {
    setConfirmZone(false);
    setBusy(true);
    const body: UpdateSettingsBody = {
      businessName: form.businessName.trim(),
      timezone: zoneOf(form),
      nearThreshold: Number(form.nearThreshold),
      wifiSsid: form.wifiEnabled ? form.wifiSsid : null,
    };
    if (form.wifiEnabled) {
      body.wifiSecurity = form.wifiSecurity;
      body.wifiPassword = form.wifiSecurity === 'nopass' ? null : form.wifiPassword;
    }
    try {
      const next = await api.put<AdminSettingsDto>('/api/admin/settings', body);
      setSaved(next);
      setForm(toForm(next));
      setErrors({});
      show({ kind: 'saved' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'queue_active') {
        show({ kind: 'queue' });
      } else if (error instanceof ApiError && error.status === 400) {
        setErrors(serverErrors(error));
        show({ kind: 'summary' });
      } else {
        show({ kind: 'failure', text: fail(error) });
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      show({ kind: 'summary' });
      return;
    }
    if (zoneOf(form) !== saved.timezone) setConfirmZone(true);
    else void save();
  }

  const origin = saved.publicUrl;

  return (
    <div className={styles.stack}>
      <SectionHead title={t.title} />
      <form className={styles.form} onSubmit={submit} noValidate>
        {notice?.kind === 'summary' && <FocusBanner key={attempt} variant="error" title={copy.common.fieldErrorsSummary} />}
        {notice?.kind === 'queue' && (
          <FocusBanner key={attempt} variant="error" title={t.timezoneQueueActiveTitle}>
            <p>{t.timezoneQueueActiveBody}</p>
          </FocusBanner>
        )}
        {notice?.kind === 'failure' && (
          <FocusBanner key={attempt} variant="error" title={copy.admin.saveFailed}>
            <p>{notice.text}</p>
          </FocusBanner>
        )}
        {notice?.kind === 'saved' && <Banner variant="success" title={t.saved} />}

        <div className={styles.group}>
          <TextField
            label={t.businessName}
            hint={t.businessNameHint}
            error={errors.businessName}
            value={form.businessName}
            autoComplete="organization"
            onChange={(event) => update('businessName', event.target.value)}
          />
        </div>

        <div className={styles.group}>
          <Select
            label={t.timezone}
            hint={t.timezoneHint}
            value={form.zoneChoice}
            onChange={(event) => update('zoneChoice', event.target.value)}
          >
            <option value="Asia/Jakarta">{t.timezoneWib}</option>
            <option value="Asia/Makassar">{t.timezoneWita}</option>
            <option value="Asia/Jayapura">{t.timezoneWit}</option>
            <option value={OTHER}>{t.timezoneOther}</option>
          </Select>
          {form.zoneChoice === OTHER && (
            <TextField
              label={t.timezoneOther}
              hint={t.timezoneOtherHint}
              error={errors.zoneOther}
              value={form.zoneOther}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => update('zoneOther', event.target.value)}
            />
          )}
          <Banner variant="warning" title={t.timezoneWarningTitle}>
            <p>{t.timezoneWarningBody}</p>
          </Banner>
        </div>

        <div className={styles.group}>
          <TextField
            label={t.nearThreshold}
            hint={t.nearThresholdHint}
            error={errors.nearThreshold}
            suffix={t.nearThresholdSuffix}
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={form.nearThreshold}
            onChange={(event) => update('nearThreshold', event.target.value)}
          />
        </div>

        <div className={styles.group}>
          <h2>{t.wifiHeading}</h2>
          <p className={styles.groupText}>{t.wifiLead}</p>
          <Banner variant="warning" title={t.wifiRiskTitle}>
            <p>{t.wifiRiskBody}</p>
          </Banner>
          <Checkbox
            label={t.wifiEnabled}
            help={t.wifiEnabledHint}
            checked={form.wifiEnabled}
            onChange={(event) => update('wifiEnabled', event.target.checked)}
          />
          {form.wifiEnabled ? (
            <>
              <TextField
                label={t.wifiSsid}
                hint={t.wifiSsidHint}
                error={errors.wifiSsid}
                value={form.wifiSsid}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => update('wifiSsid', event.target.value)}
              />
              <Select
                label={t.wifiSecurity}
                hint={t.wifiSecurityHint}
                value={form.wifiSecurity}
                onChange={(event) => update('wifiSecurity', event.target.value as WifiSecurity)}
              >
                <option value="WPA">{t.wifiSecurityWpa}</option>
                <option value="WEP">{t.wifiSecurityWep}</option>
                <option value="nopass">{t.wifiSecurityNone}</option>
              </Select>
              {form.wifiSecurity !== 'nopass' && (
                <PasswordField
                  label={t.wifiPassword}
                  hint={t.wifiPasswordHint}
                  error={errors.wifiPassword}
                  value={form.wifiPassword}
                  autoComplete="off"
                  showText={copy.common.showPassword}
                  hideText={copy.common.hidePassword}
                  showLabel={copy.common.showPasswordLabel}
                  hideLabel={copy.common.hidePasswordLabel}
                  onChange={(event) => update('wifiPassword', event.target.value)}
                />
              )}
              <Banner variant="warning" title={t.wifiNetworkTitle}>
                <ul className={styles.bullets}>
                  {t.wifiNetworkItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Banner>
            </>
          ) : (
            <p className={styles.groupText}>{t.wifiOff}</p>
          )}
        </div>

        <div className={styles.group}>
          <h2>{t.addressesHeading}</h2>
          <dl className={styles.addresses}>
            <div>
              <dt>{t.addressTake}</dt>
              <dd>{saved.takeUrl}</dd>
            </div>
            <div>
              <dt>{t.addressDisplay}</dt>
              <dd>{`${origin}/display`}</dd>
            </div>
            <div>
              <dt>{t.addressStaff}</dt>
              <dd>{`${origin}/staff`}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.formActions}>
          <Button type="submit" busy={busy}>
            {busy ? copy.common.saving : t.submit}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmZone}
        title={t.timezoneConfirmTitle(zoneOf(form))}
        body={t.timezoneWarningBody}
        cancelLabel={copy.common.cancel}
        confirmLabel={t.timezoneConfirmButton}
        busy={busy}
        busyLabel={copy.common.saving}
        onCancel={() => setConfirmZone(false)}
        onConfirm={() => void save()}
      />
    </div>
  );
}
