import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { StateView } from '../../components/StateView.tsx';
import { TextField } from '../../components/TextField.tsx';
import { copy } from '../../content/copy.ts';
import { api, ApiError } from '../../lib/api.ts';
import type { ServiceDto } from '../../../shared/contracts.ts';
import { FocusBanner } from './FocusBanner.tsx';
import { SectionHead } from './SectionHead.tsx';
import { isTooBig, issuesOf, useFailure, useResource } from './useApi.ts';
import { useDocTitle } from './useDocTitle.ts';
import styles from './admin.module.css';

const t = copy.admin.services;
const PREFIX_PATTERN = /^[A-Z]{1,3}$/;

function firstNumber(prefix: string, width: number): string {
  return `${prefix}${'1'.padStart(width, '0')}`;
}

export function ServicesSection() {
  useDocTitle(t.title);
  const fail = useFailure();
  const { state, retry, refresh } = useResource<{ services: ServiceDto[] }>('/api/admin/services');
  const [form, setForm] = useState<{ service: ServiceDto | null; nonce: number; open: boolean }>({ service: null, nonce: 0, open: false });
  const openForm = (service: ServiceDto | null) => setForm((current) => ({ service, nonce: current.nonce + 1, open: true }));
  const closeForm = () => setForm((current) => ({ ...current, open: false }));
  const [toDeactivate, setToDeactivate] = useState<ServiceDto | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function patch(service: ServiceDto, body: Record<string, unknown>) {
    setBusyId(service.id);
    setActionError(null);
    try {
      await api.patch(`/api/admin/services/${service.id}`, body);
      refresh();
    } catch (error) {
      setActionError(fail(error));
    } finally {
      setBusyId(null);
      setToDeactivate(null);
    }
  }

  async function move(list: ServiceDto[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setBusyId(list[index]!.id);
    setActionError(null);
    try {
      // Renumber the whole list: services created with the default sortOrder all share one value.
      for (const [position, service] of next.entries()) {
        if (service.sortOrder !== position) {
          await api.patch(`/api/admin/services/${service.id}`, { sortOrder: position });
        }
      }
    } catch (error) {
      setActionError(fail(error));
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  const head = (
    <SectionHead
      title={t.title}
      lead={t.lead}
      action={
        <Button onClick={() => openForm(null)}>{t.add}</Button>
      }
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

  const services = state.data.services;

  return (
    <div className={styles.stack}>
      {head}
      {actionError && (
        <Banner variant="error" title={copy.admin.saveFailed}>
          <p>{actionError}</p>
        </Banner>
      )}
      {services.length === 0 ? (
        <StateView kind="empty" message={t.empty} />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.colName}</th>
              <th scope="col">{t.colPrefix}</th>
              <th scope="col">{t.colFirstNumber}</th>
              <th scope="col">{t.colStatus}</th>
              <th scope="col">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service, index) => {
              const blocked = busyId !== null;
              return (
                <tr key={service.id} className={service.active ? undefined : styles.inactiveRow}>
                  <td className={styles.cellName}>{service.name}</td>
                  <td data-label={t.colPrefix}>{service.prefix}</td>
                  <td data-label={t.colFirstNumber}>{firstNumber(service.prefix, service.numberWidth)}</td>
                  <td data-label={t.colStatus} className={service.active ? undefined : styles.cellMuted}>
                    {service.active ? copy.common.active : copy.common.inactive}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <Button variant="quiet" disabled={blocked} onClick={() => openForm(service)}>
                        {copy.common.edit}
                      </Button>
                      <Button
                        variant="quiet"
                        disabled={blocked || index === 0}
                        aria-label={copy.common.moveUpLabel(service.name)}
                        onClick={() => void move(services, index, -1)}
                      >
                        {copy.common.moveUp}
                      </Button>
                      <Button
                        variant="quiet"
                        disabled={blocked || index === services.length - 1}
                        aria-label={copy.common.moveDownLabel(service.name)}
                        onClick={() => void move(services, index, 1)}
                      >
                        {copy.common.moveDown}
                      </Button>
                      {service.active ? (
                        <Button variant="quiet" disabled={blocked} onClick={() => setToDeactivate(service)}>
                          {copy.common.deactivate}
                        </Button>
                      ) : (
                        <Button variant="quiet" disabled={blocked} onClick={() => void patch(service, { active: true })}>
                          {copy.common.activate}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ServiceForm
        key={form.nonce}
        open={form.open}
        service={form.service}
        nextOrder={services.length}
        onClose={closeForm}
        onSaved={() => {
          closeForm();
          refresh();
        }}
      />

      <ConfirmDialog
        open={toDeactivate !== null}
        title={t.deactivateTitle(toDeactivate?.name ?? '')}
        body={t.deactivateBody}
        cancelLabel={copy.common.cancel}
        confirmLabel={t.deactivateButton(toDeactivate?.name ?? '')}
        destructive
        busy={busyId !== null}
        busyLabel={copy.common.saving}
        onCancel={() => setToDeactivate(null)}
        onConfirm={() => toDeactivate && void patch(toDeactivate, { active: false })}
      />
    </div>
  );
}

interface FormProps {
  open: boolean;
  service: ServiceDto | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}

function ServiceForm({ open, service, nextOrder, onClose, onSaved }: FormProps) {
  const fail = useFailure();
  const [name, setName] = useState(service?.name ?? '');
  const [prefix, setPrefix] = useState(service?.prefix ?? '');
  const [errors, setErrors] = useState<{ name?: string; prefix?: string }>({});
  const [summary, setSummary] = useState<{ text: string; attempt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = service !== null;

  function reject(found: { name?: string; prefix?: string }, text: string) {
    setErrors(found);
    setSummary((current) => ({ text, attempt: (current?.attempt ?? 0) + 1 }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    const found: { name?: string; prefix?: string } = {};
    if (trimmed === '') found.name = copy.common.required(t.name);
    else if (trimmed.length > 80) found.name = copy.common.maxLength(80);
    if (!PREFIX_PATTERN.test(prefix)) found.prefix = t.prefixInvalid;
    if (found.name || found.prefix) {
      reject(found, copy.common.fieldErrorsSummary);
      return;
    }

    setBusy(true);
    try {
      if (service) await api.patch(`/api/admin/services/${service.id}`, { name: trimmed, prefix });
      else await api.post('/api/admin/services', { name: trimmed, prefix, sortOrder: nextOrder });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'prefix_taken') {
        reject({ prefix: t.prefixTaken(prefix) }, copy.common.fieldErrorsSummary);
      } else if (error instanceof ApiError && error.status === 400) {
        const mapped: { name?: string; prefix?: string } = {};
        for (const issue of issuesOf(error)) {
          if (issue.path === 'prefix') mapped.prefix = t.prefixInvalid;
          if (issue.path === 'name') {
            mapped.name = isTooBig(issue.message) ? copy.common.maxLength(80) : copy.common.required(t.name);
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

  const preview = PREFIX_PATTERN.test(prefix) ? firstNumber(prefix, service?.numberWidth ?? 3) : null;
  const prefixChanged = editing && prefix !== service.prefix;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="wide"
      title={service ? t.editTitle(service.name) : t.addTitle}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.common.cancel}
          </Button>
          <Button type="submit" form="service-form" busy={busy}>
            {busy ? copy.common.saving : t.submit}
          </Button>
        </>
      }
    >
      <form id="service-form" className={styles.dialogForm} onSubmit={(event) => void submit(event)} noValidate>
        {summary && <FocusBanner key={summary.attempt} variant="error" title={summary.text} />}
        <TextField
          label={t.name}
          hint={t.nameHint}
          error={errors.name}
          value={name}
          data-autofocus
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
        />
        <TextField
          label={t.prefix}
          hint={t.prefixHint}
          error={errors.prefix}
          value={prefix}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => {
            setPrefix(event.target.value.toUpperCase());
            setErrors((current) => ({ ...current, prefix: undefined }));
          }}
        />
        {preview && <p className={styles.hint}>{t.firstNumberPreview(preview)}</p>}
        {prefixChanged && <p className={styles.hint}>{t.prefixChangeNote}</p>}
      </form>
    </Dialog>
  );
}
