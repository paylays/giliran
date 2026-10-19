import type { Db } from '../db/client.ts';
import type { SettingsDto, UpdateSettingsBody } from '../../shared/contracts.ts';

interface SettingsRow {
  business_name: string;
  timezone: string;
  near_threshold: number;
}

export function getSettings(db: Db): SettingsDto {
  const row = db.get<SettingsRow>('SELECT business_name, timezone, near_threshold FROM settings WHERE id = 1');
  if (!row) throw new Error('settings row missing; run migrations');
  return { businessName: row.business_name, timezone: row.timezone, nearThreshold: row.near_threshold };
}

export function updateSettings(db: Db, body: UpdateSettingsBody, now: number): SettingsDto {
  db.run(
    'UPDATE settings SET business_name = ?, timezone = ?, near_threshold = ?, updated_at = ? WHERE id = 1',
    body.businessName,
    body.timezone,
    body.nearThreshold,
    now,
  );
  return getSettings(db);
}
