/** The device zone. Tests pass an explicit zone instead of changing the machine. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * The calendar date in `timeZone`, from local midnight.
 * Beijing 00:00–08:00 is that Beijing date even when the UTC date is still yesterday.
 * Stored day keys are not rewritten; callers compare this string with the key already saved.
 */
export function localDayKey(now: Date, timeZone = deviceTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
