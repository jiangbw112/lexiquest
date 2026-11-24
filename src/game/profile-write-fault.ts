/**
 * Dev server and unit tests only.
 * Production builds drop this module: the only app imports sit inside
 * `import.meta.env.DEV`, which the production build replaces with false.
 * A rejected lease does not consume a failure.
 */
let profileWriteFailures = 0;

export function armProfileWriteFailures(count: number): void {
  profileWriteFailures = Number.isInteger(count) && count > 0 ? count : 0;
}

export function consumeProfileWriteFailure(): boolean {
  if (profileWriteFailures <= 0) return false;
  profileWriteFailures -= 1;
  return true;
}
