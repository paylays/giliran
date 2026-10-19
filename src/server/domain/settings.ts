import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { businessDate } from '../../shared/business-date.ts';
import type { SettingsDto, UpdateSettingsBody, WifiSecurity } from '../../shared/contracts.ts';

interface SettingsRow {
  business_name: string;
  timezone: string;
  near_threshold: number;
  wifi_ssid: string | null;
  wifi_password: string | null;
  wifi_security: WifiSecurity;
}

export function getSettings(db: Db): SettingsDto {
  const row = db.get<SettingsRow>(
    'SELECT business_name, timezone, near_threshold, wifi_ssid, wifi_password, wifi_security FROM settings WHERE id = 1',
  );
  if (!row) throw new Error('settings row missing; run migrations');
  return {
    businessName: row.business_name,
    timezone: row.timezone,
    nearThreshold: row.near_threshold,
    wifiSsid: row.wifi_ssid,
    wifiPassword: row.wifi_password,
    wifiSecurity: row.wifi_security,
  };
}

// Merges the patch over stored values, then checks the password rules for the resulting security type.
function resolveWifi(current: SettingsDto, body: UpdateSettingsBody) {
  const ssid = body.wifiSsid === undefined ? current.wifiSsid : body.wifiSsid;
  const security = body.wifiSecurity ?? current.wifiSecurity;
  const password = body.wifiPassword === undefined ? current.wifiPassword : body.wifiPassword;
  if (ssid === null || security === 'nopass') return { ssid, password: null, security };
  const bad = (message: string) => new HttpError(400, 'invalid_request', [{ path: 'wifiPassword', message }]);
  if (password === null) throw bad('Password required');
  if (security === 'WPA' && password.length < 8) throw bad('WPA password needs 8 to 63 characters');
  return { ssid, password, security };
}

export function updateSettings(db: Db, body: UpdateSettingsBody, now: number): SettingsDto {
  const current = getSettings(db);
  if (body.timezone !== current.timezone) {
    // A new timezone can shift the business date and restart numbering, duplicating live ticket numbers.
    const live = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM tickets WHERE service_date = ? AND status IN ('waiting', 'called')",
      businessDate(now, current.timezone),
    );
    if (live && live.n > 0) throw new HttpError(409, 'queue_active');
  }
  const wifi = resolveWifi(current, body);
  db.run(
    'UPDATE settings SET business_name = ?, timezone = ?, near_threshold = ?, wifi_ssid = ?, wifi_password = ?, wifi_security = ?, updated_at = ? WHERE id = 1',
    body.businessName,
    body.timezone,
    body.nearThreshold,
    wifi.ssid,
    wifi.password,
    wifi.security,
    now,
  );
  return getSettings(db);
}
