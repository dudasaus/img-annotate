import { useCallback, useRef, useState } from 'react'

import {
  type HistoryAction,
  type HistoryState,
  createHistory,
  historyReducer,
} from './history'

/**
 * Like useReducer, but the latest state is readable synchronously via `read()`,
 * so event handlers that dispatch several actions never see stale state.
 */
export function useHistoryStore<T>(initial: T) {
  const stateRef = useRef<HistoryState<T>>(createHistory(initial))
  const [state, setState] = useState(stateRef.current)

  const dispatch = useCallback((action: HistoryAction<T>) => {
    stateRef.current = historyReducer(stateRef.current, action)
    setState(stateRef.current)
  }, [])

  const read = useCallback(() => stateRef.current, [])

  const replace = useCallback((next: HistoryState<T>) => {
    stateRef.current = next
    setState(next)
  }, [])

  return { state, dispatch, read, replace }
}
