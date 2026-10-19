// Numbers past the padded width keep growing (A999 -> A1000), never wrap.
export function formatTicketNumber(prefix: string, seq: number, width: number): string {
  return `${prefix}${String(seq).padStart(width, '0')}`;
}
