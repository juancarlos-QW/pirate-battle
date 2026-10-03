/**
 * Network scenarios for the mock backend, chosen with the `?mock=` query parameter
 * (e.g. `/?mock=offline`). The choice is remembered for the browser tab; `?mock=normal` resets it
 * and `?mock=reset` also restores the initial data (see `consumeResetRequest`).
 *
 * - normal:        small, variable latency (default)
 * - slow:          every request takes ~3 s
 * - out-of-order:  alternating slow and fast responses, so later requests can answer first
 * - flaky:         half of the requests fail with a 503
 * - error:         every request fails with a 500
 * - rejected:      every request fails with a 400
 * - offline:       every request fails with a network error
 * - timeout:       requests never answer before the client timeout
 * - ranking-error: only the ranking fails (500)
 * - history-error: only the match history fails (500)
 * - save-timeout:  a submitted match is stored, but the response arrives after the client timeout
 * - empty:         a fresh backend without seed data
 */
export const MOCK_SCENARIOS = [
  'normal',
  'slow',
  'out-of-order',
  'flaky',
  'error',
  'rejected',
  'offline',
  'timeout',
  'ranking-error',
  'history-error',
  'save-timeout',
  'empty',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

const SESSION_KEY = 'pirate-battle:mock-scenario';
const RESET_VALUE = 'reset';

function isScenario(value: string | null): value is MockScenario {
  return value !== null && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

export function resolveScenario(): MockScenario {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mock');
    if (isScenario(fromUrl)) {
      window.sessionStorage.setItem(SESSION_KEY, fromUrl);
      return fromUrl;
    }
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    return isScenario(stored) ? stored : 'normal';
  } catch {
    return 'normal';
  }
}

/**
 * Handles `?mock=reset`: forgets the selected scenario, removes the given storage keys (mock
 * database, pending results…) and drops the parameter from the URL so a reload does not reset
 * again. Returns true when a reset happened.
 */
export function consumeResetRequest(keys: readonly string[]): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('mock') !== RESET_VALUE) return false;
    window.sessionStorage.removeItem(SESSION_KEY);
    for (const key of keys) window.localStorage.removeItem(key);
    url.searchParams.delete('mock');
    window.history.replaceState(null, '', url);
    return true;
  } catch {
    return false;
  }
}
