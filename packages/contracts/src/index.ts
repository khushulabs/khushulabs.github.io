/**
 * Returns true when `value` is a string with at least one non-space character.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
