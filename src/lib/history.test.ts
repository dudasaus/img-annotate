import { describe, expect, it } from 'vitest'

import { createHistory, historyReducer } from './history'

describe('historyReducer', () => {
  it('commit pushes the previous present and clears future', () => {
    let state = createHistory<number[]>([])
    state = historyReducer(state, { type: 'commit', value: [1] })
    state = historyReducer(state, { type: 'undo' })
    state = historyReducer(state, { type: 'commit', value: [2] })

    expect(state.past).toEqual([[]])
    expect(state.present).toEqual([2])
    expect(state.future).toEqual([])
  })

  it('undo and redo move one step each way', () => {
    let state = createHistory<number[]>([])
    state = historyReducer(state, { type: 'commit', value: [1] })
    state = historyReducer(state, { type: 'commit', value: [1, 2] })

    state = historyReducer(state, { type: 'undo' })
    expect(state.present).toEqual([1])
    expect(state.future).toEqual([[1, 2]])

    state = historyReducer(state, { type: 'redo' })
    expect(state.present).toEqual([1, 2])
    expect(state.future).toEqual([])
  })

  it('undo and redo are no-ops at the ends', () => {
    const state = createHistory<number[]>([])
    expect(historyReducer(state, { type: 'undo' })).toBe(state)
    expect(historyReducer(state, { type: 'redo' })).toBe(state)
  })

  it('set changes present without recording history', () => {
    let state = createHistory<number[]>([])
    state = historyReducer(state, { type: 'set', value: [9] })

    expect(state.present).toEqual([9])
    expect(state.past).toEqual([])
  })

  it('commit with an explicit base records the base instead of present', () => {
    let state = createHistory<number[]>([1])
    state = historyReducer(state, { type: 'set', value: [1, 5] })
    state = historyReducer(state, { type: 'commit', value: [1, 6], base: [1] })

    expect(state.past).toEqual([[1]])
    state = historyReducer(state, { type: 'undo' })
    expect(state.present).toEqual([1])
  })

  it('commit that equals its base does not record history', () => {
    let state = createHistory<number[]>([1])
    state = historyReducer(state, { type: 'set', value: [2] })
    state = historyReducer(state, { type: 'commit', value: [1], base: [1] })

    expect(state.present).toEqual([1])
    expect(state.past).toEqual([])
  })

  it('consecutive commits with the same coalesce key share one entry', () => {
    let state = createHistory<string[]>(['red'])
    state = historyReducer(state, { type: 'commit', value: ['a'], coalesce: 'color:1' })
    state = historyReducer(state, { type: 'commit', value: ['b'], coalesce: 'color:1' })
    state = historyReducer(state, { type: 'commit', value: ['c'], coalesce: 'color:1' })

    expect(state.past).toEqual([['red']])
    expect(state.present).toEqual(['c'])
  })

  it('a different action breaks coalescing', () => {
    let state = createHistory<string[]>(['red'])
    state = historyReducer(state, { type: 'commit', value: ['a'], coalesce: 'k' })
    state = historyReducer(state, { type: 'commit', value: ['b'] })
    state = historyReducer(state, { type: 'commit', value: ['c'], coalesce: 'k' })

    expect(state.past).toEqual([['red'], ['a'], ['b']])
  })

  it('caps past entries', () => {
    let state = createHistory<number[]>([])
    for (let index = 0; index < 150; index += 1) {
      state = historyReducer(state, { type: 'commit', value: [index] })
    }

    expect(state.past).toHaveLength(100)
  })

  it('reset clears all history', () => {
    let state = createHistory<number[]>([])
    state = historyReducer(state, { type: 'commit', value: [1] })
    state = historyReducer(state, { type: 'reset', value: [] })

    expect(state).toEqual(createHistory([]))
  })
})
