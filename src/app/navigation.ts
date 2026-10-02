export type LogTab = 'ranking' | 'history';

export type Screen =
  | { readonly name: 'menu' }
  | { readonly name: 'options' }
  | { readonly name: 'log'; readonly tab: LogTab }
  | { readonly name: 'game'; readonly runId: number }
  | { readonly name: 'result' };

export type NavigationAction =
  | { readonly type: 'menu' }
  | { readonly type: 'options' }
  | { readonly type: 'log'; readonly tab: LogTab }
  | { readonly type: 'play' }
  | { readonly type: 'result' };

export interface NavigationState {
  readonly screen: Screen;
  /** Incremented on every Play so each match mounts a brand new game instance. */
  readonly runCounter: number;
}

export const initialNavigation: NavigationState = { screen: { name: 'menu' }, runCounter: 0 };

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'menu':
      return { ...state, screen: { name: 'menu' } };
    case 'options':
      return { ...state, screen: { name: 'options' } };
    case 'log':
      return { ...state, screen: { name: 'log', tab: action.tab } };
    case 'play': {
      const runCounter = state.runCounter + 1;
      return { runCounter, screen: { name: 'game', runId: runCounter } };
    }
    case 'result':
      return { ...state, screen: { name: 'result' } };
  }
}
