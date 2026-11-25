import {
  ArrowUpRight,
  Circle,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  Eraser,
  FolderOpen,
  Minus,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  Redo2,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Button } from './components/ui/button'
import { Separator } from './components/ui/separator'
import {
  type Annotation,
  type DrawAnnotation,
  type HandleId,
  type LineAnnotation,
  type BoxAnnotation,
  type Point,
  type SizeOption,
  type TextAnnotation,
  type TextStyle,
  type Tool,
  constrainPoint,
  findAnnotationAt,
  findHandleAt,
  getContrastColor,
  getHandleCursor,
  getSizePresets,
  getTextFont,
  getTextLayout,
  measureText,
  moveAnnotation,
  pointDistance,
  resizeAnnotation,
} from './lib/annotations'
import { drawAnnotation, drawHover, drawSelection, renderImage } from './lib/render'
import {
  type TextEdit,
  beginTextEdit,
  cancelTextEdit,
  finishTextEdit,
  updateTextDraft,
} from './lib/textEditing'
import { useHistoryStore } from './lib/useHistoryStore'
import { cn } from './lib/utils'

type Interaction =
  | { kind: 'draw'; annotation: DrawAnnotation }
  | { kind: 'create'; annotation: LineAnnotation | BoxAnnotation }
  | {
      kind: 'move'
      annotationId: string
      start: Point
      base: Annotation[]
      moved: boolean
      editOnClick: boolean
    }
  | {
      kind: 'resize'
      annotationId: string
      handle: HandleId
      base: Annotation[]
    }

/** Hit tolerances, in screen pixels. */
const hitSlop = 6
const handleSlop = 10
const textPlaceholder = 'Type…'

const tools: Array<{
  id: Tool
  label: string
  shortcut: string
  icon: typeof MousePointer2
}> = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { id: 'draw', label: 'Draw', shortcut: 'P', icon: Pencil },
  { id: 'line', label: 'Line', shortcut: 'L', icon: Minus },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: ArrowUpRight },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: RectangleHorizontal },
  { id: 'circle', label: 'Ellipse', shortcut: 'O', icon: Circle },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
]

const swatches = [
  { color: '#ef4444', label: 'Red' },
  { color: '#f97316', label: 'Orange' },
  { color: '#facc15', label: 'Yellow' },
  { color: '#22c55e', label: 'Green' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#a855f7', label: 'Purple' },
  { color: '#0a0a0a', label: 'Black' },
  { color: '#ffffff', label: 'White' },
]

const sizeOptions: SizeOption[] = ['S', 'M', 'L']

function nearestSize(value: number, presets: Record<SizeOption, number>) {
  return sizeOptions.reduce((best, option) =>
    Math.abs(presets[option] - value) < Math.abs(presets[best] - value)
      ? option
      : best,
  )
}

type Toast = {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

/** Keeps toolbar clicks from stealing focus from the inline text editor. */
const keepFocus = (event: React.MouseEvent) => event.preventDefault()

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const textEditRef = useRef<TextEdit | null>(null)

  const { state: history, dispatch, read, replace } = useHistoryStore<Annotation[]>([])
  const annotations = history.present

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [preview, setPreview] = useState<Annotation | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [cursor, setCursor] = useState('default')
  const [textEdit, setTextEditState] = useState<TextEdit | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState(swatches[0].color)
  const [strokeSize, setStrokeSize] = useState<SizeOption>('M')
  const [textSize, setTextSize] = useState<SizeOption>('M')
  const [textStyle, setTextStyle] = useState<TextStyle>('outline')
  const [toast, setToast] = useState<Toast | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    imageRef.current = image
  }, [image])

  const openFile = useCallback(() => fileInputRef.current?.click(), [])

  const showToast = useCallback(
    (text: string, action?: Toast['action']) =>
      setToast({ id: Date.now(), text, action }),
    [],
  )

  const setTextEdit = useCallback((next: TextEdit | null) => {
    textEditRef.current = next
    setTextEditState(next)
  }, [])

  const presets = image
    ? getSizePresets(image.naturalWidth, image.naturalHeight)
    : null

  const displayScale = image
    ? Math.min(
        1,
        viewportSize.width / image.naturalWidth,
        viewportSize.height / image.naturalHeight,
      ) || 1
    : 1
  /** One screen pixel, in image coordinates. */
  const pixel = 1 / displayScale

  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedId) ?? null
  const editingAnnotation =
    textEdit &&
    (annotations.find(
      (annotation) => annotation.id === textEdit.id && annotation.type === 'text',
    ) as TextAnnotation | undefined)
  const isTextContext = tool === 'text' || selectedAnnotation?.type === 'text'
  const activeSize = isTextContext ? textSize : strokeSize

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const current = useCallback(() => read().present, [read])

  const finishEditing = useCallback(() => {
    const edit = textEditRef.current
    if (!edit) {
      return
    }

    dispatch(finishTextEdit(current(), edit))
    setTextEdit(null)
    setSelectedId(null)
  }, [current, dispatch, setTextEdit])

  const cancelEditing = useCallback(() => {
    const edit = textEditRef.current
    if (!edit) {
      return
    }

    dispatch(cancelTextEdit(edit))
    setTextEdit(null)
    setSelectedId(
      edit.base.some((annotation) => annotation.id === edit.id) ? edit.id : null,
    )
  }, [dispatch, setTextEdit])

  const startEditing = useCallback(
    (annotation: TextAnnotation) => {
      if (textEditRef.current?.id === annotation.id) {
        return
      }

      finishEditing()
      const { edit, action } = beginTextEdit(current(), annotation)
      dispatch(action)
      setTextEdit(edit)
      setSelectedId(annotation.id)
    },
    [current, dispatch, finishEditing, setTextEdit],
  )

  const syncStyleFrom = useCallback(
    (annotation: Annotation) => {
      setColor(annotation.color)
      if (!presets) {
        return
      }

      if (annotation.type === 'text') {
        setTextSize(nearestSize(annotation.fontSize, presets.font))
        setTextStyle(annotation.style)
      } else {
        setStrokeSize(nearestSize(annotation.strokeWidth, presets.stroke))
      }
    },
    [presets],
  )

  const selectTool = useCallback(
    (next: Tool) => {
      finishEditing()
      setTool(next)
    },
    [finishEditing],
  )

  /** Applies a style change to the selected annotation, if any. */
  const updateSelected = useCallback(
    (
      patch: (annotation: Annotation) => Annotation,
      options: { coalesce?: string } = {},
    ) => {
      const id = textEditRef.current?.id ?? selectedId
      if (!id) {
        return
      }

      const next = current().map((annotation) =>
        annotation.id === id ? patch(annotation) : annotation,
      )

      if (textEditRef.current?.id === id) {
        dispatch({ type: 'set', value: next })
      } else {
        dispatch({
          type: 'commit',
          value: next,
          coalesce: options.coalesce && `${options.coalesce}:${id}`,
        })
      }
    },
    [current, dispatch, selectedId],
  )

  const changeColor = useCallback(
    (nextColor: string, options: { coalesce?: string } = {}) => {
      setColor(nextColor)
      updateSelected((annotation) => ({ ...annotation, color: nextColor }), options)
    },
    [updateSelected],
  )

  const changeSize = useCallback(
    (size: SizeOption) => {
      if (!presets) {
        return
      }

      if (isTextContext) {
        setTextSize(size)
      } else {
        setStrokeSize(size)
      }

      updateSelected((annotation) =>
        annotation.type === 'text'
          ? { ...annotation, fontSize: presets.font[size] }
          : { ...annotation, strokeWidth: presets.stroke[size] },
      )
    },
    [isTextContext, presets, updateSelected],
  )

  const changeTextStyle = useCallback(
    (style: TextStyle) => {
      setTextStyle(style)
      updateSelected((annotation) =>
        annotation.type === 'text' ? { ...annotation, style } : annotation,
      )
    },
    [updateSelected],
  )

  const loadImageBlob = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const nextImage = new Image()
      nextImage.onload = () => {
        URL.revokeObjectURL(url)
        const previousImage = imageRef.current
        const previousHistory = read()

        setTextEdit(null)
        setImage(nextImage)
        dispatch({ type: 'reset', value: [] })
        setPreview(null)
        setSelectedId(null)

        if (previousImage && previousHistory.present.length > 0) {
          showToast('Replaced image and its annotations.', {
            label: 'Undo',
            run: () => {
              setTextEdit(null)
              setSelectedId(null)
              setImage(previousImage)
              replace(previousHistory)
            },
          })
        }
      }
      nextImage.onerror = () => {
        URL.revokeObjectURL(url)
        showToast('Could not read that image.')
      }
      nextImage.src = url
    },
    [dispatch, read, replace, setTextEdit, showToast],
  )

  const pasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      showToast('Press ⌘V to paste an image.')
      return
    }

    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType) {
          loadImageBlob(await item.getType(imageType))
          return
        }
      }
      showToast('Clipboard does not contain an image.')
    } catch {
      showToast('Clipboard access was blocked. Press ⌘V instead.')
    }
  }, [loadImageBlob, showToast])

  const undo = useCallback(() => {
    finishEditing()
    dispatch({ type: 'undo' })
    setSelectedId(null)
  }, [dispatch, finishEditing])

  const redo = useCallback(() => {
    finishEditing()
    dispatch({ type: 'redo' })
    setSelectedId(null)
  }, [dispatch, finishEditing])

  const deleteSelected = useCallback(() => {
    if (!selectedId) {
      return
    }

    dispatch({
      type: 'commit',
      value: current().filter((annotation) => annotation.id !== selectedId),
    })
    setSelectedId(null)
  }, [current, dispatch, selectedId])

  const copyImage = useCallback(async () => {
    if (!image) {
      return
    }

    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      showToast('Copying images is not supported in this browser.')
      return
    }

    finishEditing()
    try {
      const blob = new Promise<Blob>((resolve, reject) =>
        renderImage(image, current(), measureText).toBlob(
          (result) => (result ? resolve(result) : reject(new Error('render'))),
          'image/png',
        ),
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      showToast('Copied to clipboard.')
    } catch {
      showToast('Clipboard copy was blocked.')
    }
  }, [current, finishEditing, image, showToast])

  const downloadImage = useCallback(() => {
    if (!image) {
      return
    }

    finishEditing()
    const link = document.createElement('a')
    link.href = renderImage(image, current(), measureText).toDataURL('image/png')
    link.download = 'annotated-image.png'
    link.click()
    showToast('Saved annotated-image.png.')
  }, [current, finishEditing, image, showToast])

  const clearAnnotations = useCallback(() => {
    finishEditing()
    dispatch({ type: 'commit', value: [] })
    setSelectedId(null)
  }, [dispatch, finishEditing])

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      if (!image || !canvasRef.current) {
        return null
      }

      const bounds = canvasRef.current.getBoundingClientRect()

      return {
        x: ((clientX - bounds.left) / bounds.width) * image.naturalWidth,
        y: ((clientY - bounds.top) / bounds.height) * image.naturalHeight,
      }
    },
    [image],
  )

  const findTextAt = useCallback(
    (point: Point) =>
      findAnnotationAt(
        current().filter((annotation) => annotation.type === 'text'),
        point,
        hitSlop * pixel,
        measureText,
      ) as TextAnnotation | null,
    [current, pixel],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(event.clientX, event.clientY)
      if (!point || !presets || event.button !== 0) {
        return
      }

      if (textEditRef.current) {
        // One click just finishes the current text; the next one acts.
        event.preventDefault()
        finishEditing()
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      const annotationsNow = current()
      const selected =
        annotationsNow.find((annotation) => annotation.id === selectedId) ?? null

      const handle = findHandleAt(selected, point, handleSlop * pixel, measureText)
      if (selected && handle) {
        interactionRef.current = {
          kind: 'resize',
          annotationId: selected.id,
          handle: handle.id,
          base: annotationsNow,
        }
        return
      }

      if (tool === 'select') {
        const hit = findAnnotationAt(annotationsNow, point, hitSlop * pixel, measureText)
        if (!hit) {
          setSelectedId(null)
          return
        }

        setSelectedId(hit.id)
        syncStyleFrom(hit)
        interactionRef.current = {
          kind: 'move',
          annotationId: hit.id,
          start: point,
          base: annotationsNow,
          moved: false,
          editOnClick: hit.type === 'text' && hit.id === selectedId,
        }
        return
      }

      if (tool === 'text') {
        event.preventDefault()
        const hit = findTextAt(point)
        if (hit) {
          syncStyleFrom(hit)
          startEditing(hit)
          return
        }

        const fontSize = presets.font[textSize]
        const draft: TextAnnotation = {
          id: crypto.randomUUID(),
          type: 'text',
          color,
          position: { x: 0, y: 0 },
          text: '',
          fontSize,
          style: textStyle,
        }
        const layout = getTextLayout(draft, measureText)
        startEditing({
          ...draft,
          position: {
            x: point.x - layout.padding,
            y: point.y - layout.padding - layout.lineHeight / 2,
          },
        })
        return
      }

      setSelectedId(null)
      const id = crypto.randomUUID()
      const strokeWidth = presets.stroke[strokeSize]

      if (tool === 'draw') {
        const annotation: DrawAnnotation = {
          id,
          type: 'draw',
          color,
          strokeWidth,
          points: [point],
        }
        interactionRef.current = { kind: 'draw', annotation }
        setPreview(annotation)
        return
      }

      const annotation: LineAnnotation | BoxAnnotation = {
        id,
        type: tool,
        color,
        strokeWidth,
        start: point,
        end: point,
      } as LineAnnotation | BoxAnnotation
      interactionRef.current = { kind: 'create', annotation }
      setPreview(annotation)
    },
    [
      color,
      current,
      findTextAt,
      finishEditing,
      getCanvasPoint,
      pixel,
      presets,
      selectedId,
      startEditing,
      strokeSize,
      syncStyleFrom,
      textSize,
      textStyle,
      tool,
    ],
  )

  const updateHover = useCallback(
    (point: Point) => {
      const annotationsNow = current()
      const selected =
        annotationsNow.find((annotation) => annotation.id === selectedId) ?? null
      const handle = findHandleAt(selected, point, handleSlop * pixel, measureText)

      if (handle) {
        setCursor(getHandleCursor(handle.id))
        setHoveredId(null)
        return
      }

      if (tool === 'select') {
        const hit = findAnnotationAt(annotationsNow, point, hitSlop * pixel, measureText)
        setHoveredId(hit && hit.id !== selectedId ? hit.id : null)
        setCursor(hit ? 'move' : 'default')
        return
      }

      if (tool === 'text') {
        const hit = findTextAt(point)
        setHoveredId(hit?.id ?? null)
        setCursor('text')
        return
      }

      setHoveredId(null)
      setCursor('crosshair')
    },
    [current, findTextAt, pixel, selectedId, tool],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(event.clientX, event.clientY)
      const interaction = interactionRef.current
      if (!point) {
        return
      }

      if (!interaction) {
        updateHover(point)
        return
      }

      if (interaction.kind === 'draw') {
        const next = {
          ...interaction.annotation,
          points: [...interaction.annotation.points, point],
        }
        interactionRef.current = { kind: 'draw', annotation: next }
        setPreview(next)
        return
      }

      if (interaction.kind === 'create') {
        const { annotation } = interaction
        const end = event.shiftKey
          ? constrainPoint(
              annotation.start,
              point,
              annotation.type === 'line' || annotation.type === 'arrow'
                ? 'angle'
                : 'square',
            )
          : point
        const next = { ...annotation, end }
        interactionRef.current = { kind: 'create', annotation: next }
        setPreview(next)
        return
      }

      if (interaction.kind === 'move') {
        let delta = {
          x: point.x - interaction.start.x,
          y: point.y - interaction.start.y,
        }
        if (!interaction.moved && Math.hypot(delta.x, delta.y) < 3 * pixel) {
          return
        }
        interaction.moved = true

        if (event.shiftKey) {
          delta =
            Math.abs(delta.x) > Math.abs(delta.y)
              ? { x: delta.x, y: 0 }
              : { x: 0, y: delta.y }
        }

        dispatch({
          type: 'set',
          value: interaction.base.map((annotation) =>
            annotation.id === interaction.annotationId
              ? moveAnnotation(annotation, delta)
              : annotation,
          ),
        })
        return
      }

      dispatch({
        type: 'set',
        value: interaction.base.map((annotation) =>
          annotation.id === interaction.annotationId
            ? resizeAnnotation(annotation, interaction.handle, point, {
                measure: measureText,
                constrain: event.shiftKey,
              })
            : annotation,
        ),
      })
    },
    [dispatch, getCanvasPoint, pixel, updateHover],
  )

  const handlePointerUp = useCallback(() => {
    const interaction = interactionRef.current
    interactionRef.current = null
    if (!interaction) {
      return
    }

    if (interaction.kind === 'draw' || interaction.kind === 'create') {
      const { annotation } = interaction
      const isBigEnough =
        annotation.type === 'draw'
          ? annotation.points.length > 1
          : pointDistance(annotation.start, annotation.end) > 3 * pixel

      if (isBigEnough) {
        dispatch({ type: 'commit', value: [...current(), annotation] })
        setSelectedId(annotation.id)
      }
      setPreview(null)
      return
    }

    if (interaction.kind === 'move' && !interaction.moved) {
      const hit = current().find(
        (annotation) => annotation.id === interaction.annotationId,
      )
      if (interaction.editOnClick && hit?.type === 'text') {
        startEditing(hit)
      }
      return
    }

    dispatch({ type: 'commit', value: current(), base: interaction.base })
  }, [current, dispatch, pixel, startEditing])

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(event.clientX, event.clientY)
      const hit = point && findTextAt(point)
      if (hit) {
        syncStyleFrom(hit)
        startEditing(hit)
      }
    },
    [findTextAt, getCanvasPoint, startEditing, syncStyleFrom],
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((entry) => entry.type.startsWith('image/'))
        ?.getAsFile()
      if (!file) {
        return
      }

      event.preventDefault()
      loadImageBlob(file)
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loadImageBlob])

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selectedId) {
        return
      }

      dispatch({
        type: 'commit',
        value: current().map((annotation) =>
          annotation.id === selectedId
            ? moveAnnotation(annotation, { x: dx, y: dy })
            : annotation,
        ),
        coalesce: `nudge:${selectedId}`,
      })
    },
    [current, dispatch, selectedId],
  )

  const duplicateSelected = useCallback(() => {
    const source = current().find((annotation) => annotation.id === selectedId)
    if (!source) {
      return
    }

    const offset = 16 * pixel
    const copy = {
      ...moveAnnotation(source, { x: offset, y: offset }),
      id: crypto.randomUUID(),
    }
    dispatch({ type: 'commit', value: [...current(), copy] })
    setSelectedId(copy.id)
  }, [current, dispatch, pixel, selectedId])

  useEffect(() => {
    const toolShortcuts = Object.fromEntries(
      tools.map((item) => [item.shortcut.toLowerCase(), item.id]),
    )
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return
      }

      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (modifier) {
        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) {
            redo()
          } else {
            undo()
          }
        } else if (key === 'y') {
          event.preventDefault()
          redo()
        } else if (key === 'd') {
          event.preventDefault()
          duplicateSelected()
        } else if (key === 's') {
          event.preventDefault()
          downloadImage()
        } else if (key === 'o') {
          event.preventDefault()
          openFile()
        } else if (key === 'c' && !window.getSelection()?.toString()) {
          event.preventDefault()
          void copyImage()
        }
        return
      }

      if (event.altKey) {
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      } else if (event.key === 'Escape') {
        if (selectedId) {
          setSelectedId(null)
        } else {
          setTool('select')
        }
      } else if (event.key === 'Enter') {
        const selected = current().find((annotation) => annotation.id === selectedId)
        if (selected?.type === 'text') {
          event.preventDefault()
          startEditing(selected)
        }
      } else if (arrows[event.key]) {
        if (selectedId) {
          event.preventDefault()
          const [dx, dy] = arrows[event.key]
          const step = (event.shiftKey ? 10 : 1) * pixel
          nudgeSelected(dx * step, dy * step)
        }
      } else if (toolShortcuts[key] && !event.shiftKey) {
        setTool(toolShortcuts[key])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    copyImage,
    current,
    deleteSelected,
    downloadImage,
    duplicateSelected,
    nudgeSelected,
    openFile,
    pixel,
    redo,
    selectedId,
    startEditing,
    undo,
  ])

  const editingId = textEdit?.id
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!editingId || !textarea) {
      return
    }

    textarea.focus({ preventScroll: true })
    const end = textarea.value.length
    textarea.setSelectionRange(end, end)
  }, [editingId])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !image) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const width = image.naturalWidth * displayScale
    const height = image.naturalHeight * displayScale
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    context.setTransform(displayScale * dpr, 0, 0, displayScale * dpr, 0, 0)
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0)
    annotations.forEach((annotation) => drawAnnotation(context, annotation, measureText))
    if (preview) {
      drawAnnotation(context, preview, measureText)
    }

    const hovered = annotations.find((annotation) => annotation.id === hoveredId)
    if (hovered) {
      drawHover(context, hovered, measureText, pixel)
    }

    const selected = annotations.find((annotation) => annotation.id === selectedId)
    if (selected && selected.id !== editingId) {
      drawSelection(context, selected, measureText, pixel)
    }
  }, [
    annotations,
    displayScale,
    editingId,
    hoveredId,
    image,
    pixel,
    preview,
    selectedId,
    viewportSize,
  ])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeout = window.setTimeout(
      () => setToast(null),
      toast.action ? 6000 : 2500,
    )
    return () => window.clearTimeout(timeout)
  }, [toast])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setIsDragging(false)
      const file = Array.from(event.dataTransfer.files).find((entry) =>
        entry.type.startsWith('image/'),
      )
      if (file) {
        loadImageBlob(file)
      } else {
        showToast('Drop an image file.')
      }
    },
    [loadImageBlob, showToast],
  )

  const editingLayout = editingAnnotation
    ? getTextLayout(editingAnnotation, measureText)
    : null

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-950">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="flex items-center gap-1">
          {tools.map((item) => {
            const Icon = item.icon

            return (
              <Button
                key={item.id}
                type="button"
                variant={tool === item.id ? 'default' : 'ghost'}
                size="icon"
                aria-label={item.label}
                aria-pressed={tool === item.id}
                title={`${item.label} (${item.shortcut})`}
                onMouseDown={keepFocus}
                onClick={() => selectTool(item.id)}
              >
                <Icon />
              </Button>
            )
          })}
        </div>

        <Separator className="hidden h-6 w-px sm:block" data-orientation="vertical" />

        <div className="flex items-center gap-1" role="group" aria-label="Color">
          {swatches.map((swatch) => (
            <button
              key={swatch.color}
              type="button"
              aria-label={swatch.label}
              aria-pressed={color === swatch.color}
              title={swatch.label}
              className={cn(
                'size-6 rounded-full border border-black/15 transition-transform active:scale-90',
                color === swatch.color &&
                  'ring-2 ring-neutral-950 ring-offset-2 ring-offset-white',
              )}
              style={{ background: swatch.color }}
              onMouseDown={keepFocus}
              onClick={() => changeColor(swatch.color)}
            />
          ))}
          <label
            title="Custom color"
            className={cn(
              'relative size-6 cursor-pointer overflow-hidden rounded-full border border-black/15',
              !swatches.some((swatch) => swatch.color === color) &&
                'ring-2 ring-neutral-950 ring-offset-2 ring-offset-white',
            )}
            style={{
              background:
                'conic-gradient(#ef4444, #facc15, #22c55e, #3b82f6, #a855f7, #ef4444)',
            }}
          >
            <span className="sr-only">Custom color</span>
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={color}
              onChange={(event) =>
                changeColor(event.target.value, { coalesce: 'color' })
              }
            />
          </label>
        </div>

        <Separator className="hidden h-6 w-px sm:block" data-orientation="vertical" />

        <div
          className="flex items-center rounded-md border border-neutral-200 p-0.5"
          role="group"
          aria-label={isTextContext ? 'Text size' : 'Stroke width'}
          title={isTextContext ? 'Text size' : 'Stroke width'}
        >
          {sizeOptions.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={activeSize === size}
              className={cn(
                'grid h-7 w-8 place-items-center rounded text-xs font-medium text-neutral-600 hover:bg-neutral-100',
                activeSize === size && 'bg-neutral-950 text-white hover:bg-neutral-950',
              )}
              onMouseDown={keepFocus}
              onClick={() => changeSize(size)}
            >
              {isTextContext ? (
                size
              ) : (
                <span
                  className="block w-4 rounded-full bg-current"
                  style={{ height: { S: 1.5, M: 3, L: 5 }[size] }}
                />
              )}
            </button>
          ))}
        </div>

        {isTextContext ? (
          <div
            className="flex items-center rounded-md border border-neutral-200 p-0.5"
            role="group"
            aria-label="Text style"
          >
            {(['outline', 'label'] as const).map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={textStyle === style}
                title={style === 'outline' ? 'Outlined text' : 'Text on a label'}
                className={cn(
                  'h-7 rounded px-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100',
                  textStyle === style && 'bg-neutral-950 text-white hover:bg-neutral-950',
                )}
                onMouseDown={keepFocus}
                onClick={() => changeTextStyle(style)}
              >
                {style === 'outline' ? 'Outline' : 'Label'}
              </button>
            ))}
          </div>
        ) : null}

        <Separator className="hidden h-6 w-px sm:block" data-orientation="vertical" />

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Undo"
            title="Undo (⌘Z)"
            disabled={history.past.length === 0 && !textEdit}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={history.future.length === 0}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete selected"
            title="Delete selected (⌫)"
            disabled={!selectedId}
            onClick={deleteSelected}
          >
            <Trash2 />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                loadImageBlob(file)
              }
              event.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open image"
            title="Open image (⌘O)"
            onClick={openFile}
          >
            <FolderOpen />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Paste image"
            title="Paste image (⌘V)"
            onClick={() => void pasteFromClipboard()}
          >
            <ClipboardPaste />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear annotations"
            title="Clear annotations"
            disabled={annotations.length === 0}
            onClick={clearAnnotations}
          >
            <Eraser />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copy image"
            title="Copy image (⌘C)"
            disabled={!image}
            onClick={() => void copyImage()}
          >
            <ClipboardCopy />
          </Button>
          <Button
            type="button"
            disabled={!image}
            title="Download (⌘S)"
            onClick={downloadImage}
          >
            <Download />
            Download
          </Button>
        </div>
      </header>

      <section
        ref={viewportRef}
        className="relative grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden bg-neutral-100 p-6"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            setIsDragging(true)
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false)
          }
        }}
        onDrop={handleDrop}
      >
        {image ? (
          <div
            className="relative shadow-sm"
            style={{
              width: image.naturalWidth * displayScale,
              height: image.naturalHeight * displayScale,
            }}
          >
            <canvas
              ref={canvasRef}
              className="block touch-none select-none"
              style={{ cursor }}
              onDoubleClick={handleDoubleClick}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => setHoveredId(null)}
            />

            {editingAnnotation && editingLayout ? (
              <>
                <div
                  className="pointer-events-none absolute left-0 top-0 origin-top-left"
                  style={{
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                    transform: `scale(${displayScale})`,
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    aria-label="Annotation text"
                    placeholder={textPlaceholder}
                    wrap="off"
                    spellCheck={false}
                    rows={1}
                    className="pointer-events-auto absolute resize-none overflow-hidden border-0 bg-transparent placeholder:text-[var(--placeholder)] focus:outline-none"
                    style={
                      {
                        '--placeholder':
                          editingAnnotation.style === 'label'
                            ? `${getContrastColor(editingAnnotation.color)}99`
                            : `${editingAnnotation.color}99`,
                        left: editingLayout.x,
                        top: editingLayout.y,
                        width:
                          Math.max(
                            editingLayout.width,
                            measureText(textPlaceholder, editingAnnotation.fontSize) +
                              editingLayout.padding * 2,
                          ) + editingAnnotation.fontSize,
                        height: editingLayout.height,
                        padding: editingLayout.padding,
                        font: getTextFont(editingAnnotation.fontSize),
                        lineHeight: `${editingLayout.lineHeight}px`,
                        whiteSpace: 'pre',
                        color: 'transparent',
                        caretColor:
                          editingAnnotation.style === 'label'
                            ? getContrastColor(editingAnnotation.color)
                            : editingAnnotation.color,
                        background:
                          editingAnnotation.style === 'label' &&
                          editingAnnotation.text.trim() === ''
                            ? editingAnnotation.color
                            : 'transparent',
                        borderRadius: editingAnnotation.fontSize * 0.25,
                        outline: `${pixel}px dashed #0ea5e9`,
                        outlineOffset: pixel * 2,
                      } as React.CSSProperties
                    }
                    value={editingAnnotation.text}
                    onChange={(event) =>
                      dispatch(
                        updateTextDraft(current(), editingAnnotation.id, {
                          text: event.target.value,
                        }),
                      )
                    }
                    onBlur={finishEditing}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelEditing()
                      } else if (
                        event.key === 'Enter' &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault()
                        finishEditing()
                      }
                    }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute whitespace-nowrap rounded bg-neutral-950/80 px-1.5 py-0.5 text-[11px] text-white"
                  style={{
                    left: editingLayout.x * displayScale,
                    top: (editingLayout.y + editingLayout.height) * displayScale + 12,
                  }}
                >
                  ⌘↵ done · Esc cancel · ↵ new line
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
            <p className="text-sm text-neutral-600">
              Paste (⌘V), drop, or open an image to start annotating.
            </p>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void pasteFromClipboard()}>
                <ClipboardPaste />
                Paste image
              </Button>
              <Button type="button" variant="outline" onClick={openFile}>
                <FolderOpen />
                Open file
              </Button>
            </div>
          </div>
        )}

        {isDragging ? (
          <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-sky-500 bg-sky-500/10 text-sm font-medium text-sky-700">
            Drop image to annotate
          </div>
        ) : null}

        {toast ? (
          <div
            key={toast.id}
            role="status"
            className="toast-in absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md bg-neutral-950 px-3 py-2 text-sm text-white shadow-lg"
          >
            {toast.text}
            {toast.action ? (
              <button
                type="button"
                className="font-medium text-sky-300 hover:text-sky-200"
                onClick={() => {
                  toast.action?.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
