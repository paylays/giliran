import { describe, expect, it } from 'vitest';
import { formatTicketNumber } from '../../src/shared/ticket-number.ts';

describe('formatTicketNumber', () => {
  it('pads the sequence with zeros to the width', () => {
    expect(formatTicketNumber('A', 1, 3)).toBe('A001');
    expect(formatTicketNumber('A', 42, 3)).toBe('A042');
    expect(formatTicketNumber('AB', 7, 4)).toBe('AB0007');
  });

  it('grows past the width instead of wrapping', () => {
    expect(formatTicketNumber('A', 999, 3)).toBe('A999');
    expect(formatTicketNumber('A', 1000, 3)).toBe('A1000');
    expect(formatTicketNumber('A', 12_345, 3)).toBe('A12345');
  });

  it('keeps numbers of different prefixes distinct for the same sequence', () => {
    expect(formatTicketNumber('A', 1, 3)).not.toBe(formatTicketNumber('B', 1, 3));
  });
});
