const maxPastEntries = 100

export type HistoryState<T> = {
  past: T[]
  present: T
  future: T[]
  coalesceKey: string | null
}

export type HistoryAction<T> =
  | { type: 'set'; value: T }
  | { type: 'commit'; value: T; base?: T; coalesce?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: T }

export function createHistory<T>(value: T): HistoryState<T> {
  return { past: [], present: value, future: [], coalesceKey: null }
}

function isEqual<T>(first: T, second: T) {
  return first === second || JSON.stringify(first) === JSON.stringify(second)
}

export function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case 'set':
      return { ...state, present: action.value }

    case 'commit': {
      const base = action.base ?? state.present
      if (isEqual(base, action.value)) {
        return { ...state, present: action.value }
      }

      const coalesceKey = action.coalesce ?? null
      if (coalesceKey && coalesceKey === state.coalesceKey) {
        return { ...state, present: action.value, future: [] }
      }

      return {
        past: [...state.past, base].slice(-maxPastEntries),
        present: action.value,
        future: [],
        coalesceKey,
      }
    }

    case 'undo': {
      const previous = state.past.at(-1)
      if (previous === undefined) {
        return state
      }

      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        coalesceKey: null,
      }
    }

    case 'redo': {
      const [next, ...future] = state.future
      if (next === undefined) {
        return state
      }

      return {
        past: [...state.past, state.present],
        present: next,
        future,
        coalesceKey: null,
      }
    }

    case 'reset':
      return createHistory(action.value)
  }
}
