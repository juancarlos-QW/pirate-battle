/**
 * Network scenarios for the mock backend, chosen with the `?mock=` query parameter
 * (e.g. `/?mock=offline`). The choice is remembered for the browser tab; `?mock=normal` resets it.
 *
 * - normal:  small realistic latency (default)
 * - slow:    every request takes ~3 s
 * - flaky:   half of the requests fail with a 503
 * - error:   every request fails with a 500
 * - offline: every request fails with a network error
 * - empty:   a fresh backend without seed data
 */
export const MOCK_SCENARIOS = ['normal', 'slow', 'flaky', 'error', 'offline', 'empty'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

const SESSION_KEY = 'pirate-battle:mock-scenario';

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
