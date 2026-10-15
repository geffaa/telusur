/**
 * Every namespace declares English and Indonesian side by side. The Indonesian table must
 * have exactly the English keys, so a missing translation is a type error, not a blank.
 */
export function defineMessages<T extends Record<string, string>>(m: { en: T; id: Record<keyof T, string> }) {
  return m;
}
