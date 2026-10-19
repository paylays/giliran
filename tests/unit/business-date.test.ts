import { describe, expect, it } from 'vitest';
import { businessDate, msUntilNextBusinessDay } from '../../src/shared/business-date.ts';

// 2023-11-15 16:59:59.999 UTC is 23:59:59.999 in Jakarta (UTC+7).
const JAKARTA_LAST_MS = Date.UTC(2023, 10, 15, 16, 59, 59, 999);
const JAKARTA_MIDNIGHT = JAKARTA_LAST_MS + 1;

describe('businessDate', () => {
  it('flips at local midnight in Asia/Jakarta', () => {
    expect(businessDate(JAKARTA_LAST_MS - 59_000, 'Asia/Jakarta')).toBe('2023-11-15'); // 23:59:00
    expect(businessDate(JAKARTA_LAST_MS, 'Asia/Jakarta')).toBe('2023-11-15'); // 23:59:59.999
    expect(businessDate(JAKARTA_MIDNIGHT, 'Asia/Jakarta')).toBe('2023-11-16'); // 00:00:00.000
    expect(businessDate(JAKARTA_MIDNIGHT + 60_000, 'Asia/Jakarta')).toBe('2023-11-16');
  });

  it('uses the local date of a timezone behind UTC (America/New_York, UTC-5 in November)', () => {
    // 04:59:59.999 UTC is 23:59:59.999 the day before in New York.
    const lastMs = Date.UTC(2023, 10, 16, 4, 59, 59, 999);
    expect(businessDate(lastMs, 'America/New_York')).toBe('2023-11-15');
    expect(businessDate(lastMs + 1, 'America/New_York')).toBe('2023-11-16');
    // The same instant is already the 16th in Jakarta.
    expect(businessDate(lastMs, 'Asia/Jakarta')).toBe('2023-11-16');
  });

  it('uses the local date of a timezone far ahead of UTC (Pacific/Auckland, UTC+13 in November)', () => {
    // 10:59:59.999 UTC is 23:59:59.999 in Auckland.
    const lastMs = Date.UTC(2023, 10, 15, 10, 59, 59, 999);
    expect(businessDate(lastMs, 'Pacific/Auckland')).toBe('2023-11-15');
    expect(businessDate(lastMs + 1, 'Pacific/Auckland')).toBe('2023-11-16');
  });

  it('formats month and day with leading zeros and handles year end', () => {
    expect(businessDate(Date.UTC(2024, 0, 5, 3), 'Asia/Jakarta')).toBe('2024-01-05');
    expect(businessDate(Date.UTC(2023, 11, 31, 17), 'Asia/Jakarta')).toBe('2024-01-01');
  });
});

describe('msUntilNextBusinessDay', () => {
  it('counts down to local midnight and restarts at a full day', () => {
    expect(msUntilNextBusinessDay(JAKARTA_LAST_MS, 'Asia/Jakarta')).toBe(1);
    expect(msUntilNextBusinessDay(JAKARTA_LAST_MS - 59_000, 'Asia/Jakarta')).toBe(59_001);
    expect(msUntilNextBusinessDay(JAKARTA_MIDNIGHT, 'Asia/Jakarta')).toBe(86_400_000);
  });

  it('follows the given timezone', () => {
    const lastMs = Date.UTC(2023, 10, 16, 4, 59, 59, 999);
    expect(msUntilNextBusinessDay(lastMs, 'America/New_York')).toBe(1);
    expect(msUntilNextBusinessDay(lastMs + 1, 'America/New_York')).toBe(86_400_000);
  });
});
