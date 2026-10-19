import { useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { Checkbox } from '../../components/Checkbox.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { Dialog } from '../../components/Dialog.tsx';
import { StateView } from '../../components/StateView.tsx';
import { TextField } from '../../components/TextField.tsx';
import { copy } from '../../content/copy.ts';
import { api, ApiError } from '../../lib/api.ts';
import { enqueueCallAnnouncement, unlockAudio, useAudioStatus } from '../../lib/announce.ts';
import type { CounterDto, ServiceDto } from '../../../shared/contracts.ts';
import { FocusBanner } from './FocusBanner.tsx';
import { SectionHead } from './SectionHead.tsx';
import { isTooBig, issuesOf, useFailure, useResource } from './useApi.ts';
import { useDocTitle } from './useDocTitle.ts';
import styles from './admin.module.css';

const t = copy.admin.counters;

function serviceNames(counter: CounterDto, services: ServiceDto[]): string {
  const names = services.filter((service) => counter.serviceIds.includes(service.id)).map((service) => service.name);
  return names.length > 0 ? names.join(', ') : t.servicesNoneInRow;
}

export function CountersSection() {
  useDocTitle(t.title);
  const fail = useFailure();
  const counters = useResource<{ counters: CounterDto[] }>('/api/admin/counters');
  const services = useResource<{ services: ServiceDto[] }>('/api/admin/services');
  const [form, setForm] = useState<{ counter: CounterDto | null; nonce: number; open: boolean }>({
    counter: null,
    nonce: 0,
    open: false,
  });
  const [toDeactivate, setToDeactivate] = useState<CounterDto | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openForm = (counter: CounterDto | null) =>
    setForm((current) => ({ counter, nonce: current.nonce + 1, open: true }));
  const closeForm = () => setForm((current) => ({ ...current, open: false }));

  async function setActive(counter: CounterDto, active: boolean) {
    setBusyId(counter.id);
    setActionError(null);
    try {
      await api.patch(`/api/admin/counters/${counter.id}`, { active });
      counters.refresh();
    } catch (error) {
      setActionError(
        error instanceof ApiError && error.code === 'counter_has_called_ticket' ? t.calledTicketConflict : fail(error),
      );
    } finally {
      setBusyId(null);
      setToDeactivate(null);
    }
  }

  const head = <SectionHead title={t.title} lead={t.lead} action={<Button onClick={() => openForm(null)}>{t.add}</Button>} />;

  if (counters.state.status === 'loading' || services.state.status === 'loading') {
    return (
      <div className={styles.stack}>
        {head}
        <StateView kind="loading" message={t.loading} />
      </div>
    );
  }
  if (counters.state.status === 'error' || services.state.status === 'error') {
    const message =
      counters.state.status === 'error' ? counters.state.message : services.state.status === 'error' ? services.state.message : '';
    return (
      <div className={styles.stack}>
        {head}
        <StateView
          kind="error"
          title={t.loadError}
          message={message}
          retryLabel={copy.common.retry}
          onRetry={() => {
            counters.retry();
            services.retry();
          }}
        />
      </div>
    );
  }

  const list = counters.state.data.counters;
  const allServices = services.state.data.services;

  return (
    <div className={styles.stack}>
      {head}
      {actionError && (
        <Banner variant="error" title={copy.admin.actionFailedTitle}>
          <p>{actionError}</p>
        </Banner>
      )}
      {list.length === 0 ? (
        <StateView kind="empty" message={t.empty} />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.colName}</th>
              <th scope="col">{t.colServices}</th>
              <th scope="col">{t.colStatus}</th>
              <th scope="col">{t.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((counter) => {
              const blocked = busyId !== null;
              return (
                <tr key={counter.id} className={counter.active ? undefined : styles.inactiveRow}>
                  <td className={styles.cellName}>{counter.name}</td>
                  <td data-label={t.colServices}>{serviceNames(counter, allServices)}</td>
                  <td data-label={t.colStatus} className={counter.active ? undefined : styles.cellMuted}>
                    {counter.active ? copy.common.active : copy.common.inactive}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <Button variant="quiet" disabled={blocked} onClick={() => openForm(counter)}>
                        {copy.common.edit}
                      </Button>
                      {counter.active ? (
                        <Button variant="quiet" disabled={blocked} onClick={() => setToDeactivate(counter)}>
                          {copy.common.deactivate}
                        </Button>
                      ) : (
                        <Button variant="quiet" disabled={blocked} onClick={() => void setActive(counter, true)}>
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

      <CounterForm
        key={form.nonce}
        open={form.open}
        counter={form.counter}
        services={allServices}
        nextOrder={list.length}
        onClose={closeForm}
        onSaved={() => {
          closeForm();
          counters.refresh();
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
        onConfirm={() => toDeactivate && void setActive(toDeactivate, false)}
      />
    </div>
  );
}

interface FormProps {
  open: boolean;
  counter: CounterDto | null;
  services: ServiceDto[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}

function CounterForm({ open, counter, services, nextOrder, onClose, onSaved }: FormProps) {
  const fail = useFailure();
  const audio = useAudioStatus();
  const [name, setName] = useState(counter?.name ?? '');
  const [serviceIds, setServiceIds] = useState<number[]>(counter?.serviceIds ?? []);
  const [nameError, setNameError] = useState<string | undefined>();
  const [summary, setSummary] = useState<{ text: string; attempt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  // Active services, plus inactive ones this counter still has, so saving does not drop them silently.
  const choices = services.filter((service) => service.active || serviceIds.includes(service.id) || counter?.serviceIds.includes(service.id));

  function reject(text: string, error?: string) {
    setNameError(error);
    setSummary((current) => ({ text, attempt: (current?.attempt ?? 0) + 1 }));
  }

  function toggle(id: number, checked: boolean) {
    setServiceIds((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));
  }

  async function preview() {
    const spoken = name.trim();
    if (spoken === '') {
      setNameError(copy.common.required(t.name));
      return;
    }
    await unlockAudio();
    setPreviewed(true);
    void enqueueCallAnnouncement({ callId: 'preview:1', number: 'A001', counterName: spoken, calledAt: Date.now() });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 80) {
      reject(
        copy.common.fieldErrorsSummary,
        trimmed === '' ? copy.common.required(t.name) : copy.common.maxLength(80),
      );
      return;
    }
    setBusy(true);
    try {
      if (counter) await api.patch(`/api/admin/counters/${counter.id}`, { name: trimmed, serviceIds });
      else await api.post('/api/admin/counters', { name: trimmed, sortOrder: nextOrder, serviceIds });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && issuesOf(error).some((i) => i.path === 'name')) {
        const big = issuesOf(error).some((i) => i.path === 'name' && isTooBig(i.message));
        reject(copy.common.fieldErrorsSummary, big ? copy.common.maxLength(80) : copy.common.required(t.name));
      } else if (error instanceof ApiError && error.code === 'counter_has_called_ticket') {
        reject(t.calledTicketConflict);
      } else if (error instanceof ApiError && error.code === 'unknown_service') {
        reject(t.unknownService);
      } else {
        reject(fail(error));
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
      title={counter ? t.editTitle(counter.name) : t.addTitle}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.common.cancel}
          </Button>
          <Button type="submit" form="counter-form" busy={busy}>
            {busy ? copy.common.saving : t.submit}
          </Button>
        </>
      }
    >
      <form id="counter-form" className={styles.dialogForm} onSubmit={(event) => void submit(event)} noValidate>
        {summary && <FocusBanner key={summary.attempt} variant="error" title={summary.text} />}
        <TextField
          label={t.name}
          hint={t.nameHint}
          error={nameError}
          value={name}
          data-autofocus
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
        />
        <div>
          <Button variant="secondary" onClick={() => void preview()}>
            {t.preview}
          </Button>
          {previewed && audio === 'chime-only' && <p className={styles.warningText}>{t.previewUnavailable}</p>}
        </div>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t.services}</legend>
          <p className={styles.hint}>{t.servicesHint}</p>
          {choices.length === 0 ? (
            <p className={styles.hint}>{t.servicesEmpty}</p>
          ) : (
            choices.map((service) => (
              <Checkbox
                key={service.id}
                label={service.active ? service.name : `${service.name} (${copy.common.inactive})`}
                checked={serviceIds.includes(service.id)}
                onChange={(event) => toggle(service.id, event.target.checked)}
              />
            ))
          )}
          {serviceIds.length === 0 && <p className={styles.warningText}>{t.servicesNoneWarning}</p>}
        </fieldset>
      </form>
    </Dialog>
  );
}
