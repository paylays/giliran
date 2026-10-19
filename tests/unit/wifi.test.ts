import { describe, expect, it } from 'vitest';
import { buildWifiPayload, escapeWifiValue } from '../../src/server/domain/wifi.ts';

describe('wifi payload', () => {
  it('builds a WPA payload', () => {
    expect(buildWifiPayload('Cafe', 'secret123', 'WPA')).toBe('WIFI:T:WPA;S:Cafe;P:secret123;;');
  });

  it('escapes backslash, semicolon, comma, colon and quote', () => {
    expect(escapeWifiValue('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f');
    expect(buildWifiPayload('My;Net', 'p:a;s,s"\\', 'WPA')).toBe('WIFI:T:WPA;S:My\\;Net;P:p\\:a\\;s\\,s\\"\\\\;;');
  });

  it('omits the password for open networks', () => {
    expect(buildWifiPayload('Guest', 'ignored', 'nopass')).toBe('WIFI:T:nopass;S:Guest;;');
  });
});
