import type { Annotation, TextAnnotation } from './annotations'
import type { HistoryAction } from './history'

export type TextEdit = {
  id: string
  /** Annotations before the edit began; the single undo point for the edit. */
  base: Annotation[]
}

type Action = HistoryAction<Annotation[]>

export function beginTextEdit(
  annotations: Annotation[],
  target: TextAnnotation,
): { edit: TextEdit; action: Action } {
  const exists = annotations.some((annotation) => annotation.id === target.id)

  return {
    edit: { id: target.id, base: annotations },
    action: { type: 'set', value: exists ? annotations : [...annotations, target] },
  }
}

export function updateTextDraft(
  annotations: Annotation[],
  id: string,
  patch: Partial<Omit<TextAnnotation, 'id' | 'type'>>,
): Action {
  return {
    type: 'set',
    value: annotations.map((annotation) =>
      annotation.id === id && annotation.type === 'text'
        ? { ...annotation, ...patch }
        : annotation,
    ),
  }
}

export function finishTextEdit(annotations: Annotation[], edit: TextEdit): Action {
  const value = annotations.filter(
    (annotation) =>
      annotation.id !== edit.id ||
      annotation.type !== 'text' ||
      annotation.text.trim() !== '',
  )

  return { type: 'commit', value, base: edit.base }
}

export function cancelTextEdit(edit: TextEdit): Action {
  return { type: 'set', value: edit.base }
}
