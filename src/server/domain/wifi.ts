import type { WifiSecurity } from '../../shared/contracts.ts';

// The Wi-Fi QR format reserves \ ; , : and " in values; each needs a backslash.
export function escapeWifiValue(value: string): string {
  return value.replace(/[\\;,:"]/g, (ch) => `\\${ch}`);
}

export function buildWifiPayload(ssid: string, password: string | null, security: WifiSecurity): string {
  const pass = security === 'nopass' || password === null ? '' : `P:${escapeWifiValue(password)};`;
  return `WIFI:T:${security};S:${escapeWifiValue(ssid)};${pass};`;
}
