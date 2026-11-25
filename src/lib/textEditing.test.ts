import { describe, expect, it } from 'vitest'

import type { Annotation, TextAnnotation } from './annotations'
import { createHistory, historyReducer, type HistoryState } from './history'
import {
  beginTextEdit,
  cancelTextEdit,
  finishTextEdit,
  updateTextDraft,
} from './textEditing'

const draft: TextAnnotation = {
  id: 'new',
  type: 'text',
  color: '#f00',
  position: { x: 0, y: 0 },
  text: '',
  fontSize: 20,
  style: 'outline',
}

const existing: TextAnnotation = { ...draft, id: 'old', text: 'hello' }

function apply(state: HistoryState<Annotation[]>, action: Parameters<typeof historyReducer<Annotation[]>>[1]) {
  return historyReducer(state, action)
}

describe('text editing', () => {
  it('finishing a new empty draft leaves no annotation and no history', () => {
    let state = createHistory<Annotation[]>([])
    const begin = beginTextEdit(state.present, draft)
    state = apply(state, begin.action)

    state = apply(state, finishTextEdit(state.present, begin.edit))

    expect(state.present).toEqual([])
    expect(state.past).toEqual([])
  })

  it('typing into a new draft records exactly one history entry', () => {
    let state = createHistory<Annotation[]>([])
    const begin = beginTextEdit(state.present, draft)
    state = apply(state, begin.action)
    state = apply(state, updateTextDraft(state.present, 'new', { text: 'H' }))
    state = apply(state, updateTextDraft(state.present, 'new', { text: 'Hi' }))

    state = apply(state, finishTextEdit(state.present, begin.edit))
    expect(state.present).toMatchObject([{ text: 'Hi' }])
    expect(state.past).toHaveLength(1)

    state = apply(state, { type: 'undo' })
    expect(state.present).toEqual([])
  })

  it('whitespace-only text counts as empty', () => {
    let state = createHistory<Annotation[]>([])
    const begin = beginTextEdit(state.present, draft)
    state = apply(state, begin.action)
    state = apply(state, updateTextDraft(state.present, 'new', { text: '  \n ' }))

    state = apply(state, finishTextEdit(state.present, begin.edit))
    expect(state.present).toEqual([])
  })

  it('clearing an existing text deletes it in one undoable step', () => {
    let state = createHistory<Annotation[]>([existing])
    const begin = beginTextEdit(state.present, existing)
    state = apply(state, begin.action)
    state = apply(state, updateTextDraft(state.present, 'old', { text: '' }))

    state = apply(state, finishTextEdit(state.present, begin.edit))
    expect(state.present).toEqual([])

    state = apply(state, { type: 'undo' })
    expect(state.present).toEqual([existing])
  })

  it('cancel restores the original annotations without history', () => {
    let state = createHistory<Annotation[]>([existing])
    const begin = beginTextEdit(state.present, existing)
    state = apply(state, begin.action)
    state = apply(state, updateTextDraft(state.present, 'old', { text: 'changed', fontSize: 40 }))

    state = apply(state, cancelTextEdit(begin.edit))
    expect(state.present).toEqual([existing])
    expect(state.past).toEqual([])
  })

  it('style changes during an edit are part of the same entry', () => {
    let state = createHistory<Annotation[]>([existing])
    const begin = beginTextEdit(state.present, existing)
    state = apply(state, begin.action)
    state = apply(state, updateTextDraft(state.present, 'old', { color: '#00f' }))
    state = apply(state, updateTextDraft(state.present, 'old', { text: 'hello!' }))

    state = apply(state, finishTextEdit(state.present, begin.edit))
    expect(state.past).toHaveLength(1)
    expect(state.present).toMatchObject([{ color: '#00f', text: 'hello!' }])
  })
})
