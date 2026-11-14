/**
 * Escapes regex metacharacters so user-provided search text is matched
 * literally instead of being interpreted as a pattern (e.g. "." or "*").
 *
 * @param value - Raw search string from the client.
 * @returns The string with regex special characters escaped.
 */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
