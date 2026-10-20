/** Keeps the first and last word of a long name, for example "Ruang Periksa 2" becomes "Ruang… 2". */
export function shortenName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 3) return name;
  return `${words[0]}… ${words[words.length - 1]}`;
}
