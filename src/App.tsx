import {
  ArrowUpRight,
  Circle,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  Minus,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  Redo2,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Separator } from './components/ui/separator'
import { cn } from './lib/utils'

type Point = {
  x: number
  y: number
}

type Tool = 'select' | 'draw' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text'

type DrawAnnotation = {
  id: string
  type: 'draw'
  color: string
  points: Point[]
}

type LineAnnotation = {
  id: string
  type: 'line' | 'arrow'
  color: string
  start: Point
  end: Point
}

type BoxAnnotation = {
  id: string
  type: 'rectangle' | 'circle'
  color: string
  start: Point
  end: Point
}

type TextAnnotation = {
  id: string
  type: 'text'
  color: string
  position: Point
  text: string
  fontSize: number
}

type Annotation =
  | DrawAnnotation
  | LineAnnotation
  | BoxAnnotation
  | TextAnnotation

type Interaction =
  | {
      kind: 'draw'
      annotation: DrawAnnotation
    }
  | {
      kind: 'create'
      annotation: LineAnnotation | BoxAnnotation
    }
  | {
      kind: 'move'
      annotationId: string
      start: Point
      originalAnnotations: Annotation[]
    }
  | {
      kind: 'resize'
      annotationId: string
      handleIndex: number
      originalAnnotations: Annotation[]
    }

const strokeWidth = 4
const handleSize = 8
const textFontSize = 28

const tools: Array<{
  id: Tool
  label: string
  icon: typeof MousePointer2
}> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleHorizontal },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'text', label: 'Text', icon: Type },
]

function cloneAnnotations(annotations: Annotation[]) {
  return structuredClone(annotations) as Annotation[]
}

function pointDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const segmentLengthSquared =
    (end.x - start.x) * (end.x - start.x) +
    (end.y - start.y) * (end.y - start.y)

  if (segmentLengthSquared === 0) {
    return pointDistance(point, start)
  }

  const rawProgress =
    ((point.x - start.x) * (end.x - start.x) +
      (point.y - start.y) * (end.y - start.y)) /
    segmentLengthSquared
  const progress = Math.max(0, Math.min(1, rawProgress))
  const projection = {
    x: start.x + progress * (end.x - start.x),
    y: start.y + progress * (end.y - start.y),
  }

  return pointDistance(point, projection)
}

function getBox(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function moveAnnotation(annotation: Annotation, delta: Point): Annotation {
  if (annotation.type === 'draw') {
    return {
      ...annotation,
      points: annotation.points.map((point) => ({
        x: point.x + delta.x,
        y: point.y + delta.y,
      })),
    }
  }

  if (annotation.type === 'text') {
    return {
      ...annotation,
      position: {
        x: annotation.position.x + delta.x,
        y: annotation.position.y + delta.y,
      },
    }
  }

  return {
    ...annotation,
    start: { x: annotation.start.x + delta.x, y: annotation.start.y + delta.y },
    end: { x: annotation.end.x + delta.x, y: annotation.end.y + delta.y },
  }
}

function resizeAnnotation(
  annotation: Annotation,
  handleIndex: number,
  point: Point,
): Annotation {
  if (
    annotation.type === 'line' ||
    annotation.type === 'arrow' ||
    annotation.type === 'rectangle' ||
    annotation.type === 'circle'
  ) {
    return handleIndex === 0
      ? { ...annotation, start: point }
      : { ...annotation, end: point }
  }

  return annotation
}

function getTextBounds(annotation: TextAnnotation) {
  return {
    x: annotation.position.x,
    y: annotation.position.y - annotation.fontSize,
    width: Math.max(48, annotation.text.length * annotation.fontSize * 0.58),
    height: annotation.fontSize * 1.2,
  }
}

function getHandles(annotation: Annotation): Point[] {
  if (
    annotation.type === 'line' ||
    annotation.type === 'arrow' ||
    annotation.type === 'rectangle' ||
    annotation.type === 'circle'
  ) {
    return [annotation.start, annotation.end]
  }

  if (annotation.type === 'text') {
    const bounds = getTextBounds(annotation)

    return [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ]
  }

  return []
}

function hitTest(annotation: Annotation, point: Point) {
  if (annotation.type === 'draw') {
    return annotation.points.some((current, index) => {
      const previous = annotation.points[index - 1]
      return previous
        ? distanceToSegment(point, previous, current) <= 10
        : pointDistance(point, current) <= 10
    })
  }

  if (annotation.type === 'line' || annotation.type === 'arrow') {
    return distanceToSegment(point, annotation.start, annotation.end) <= 10
  }

  if (annotation.type === 'rectangle') {
    const box = getBox(annotation.start, annotation.end)

    return (
      point.x >= box.x - 8 &&
      point.x <= box.x + box.width + 8 &&
      point.y >= box.y - 8 &&
      point.y <= box.y + box.height + 8
    )
  }

  if (annotation.type === 'circle') {
    const box = getBox(annotation.start, annotation.end)
    const radiusX = Math.max(box.width / 2, 1)
    const radiusY = Math.max(box.height / 2, 1)
    const center = { x: box.x + radiusX, y: box.y + radiusY }
    const normalized =
      ((point.x - center.x) * (point.x - center.x)) / (radiusX * radiusX) +
      ((point.y - center.y) * (point.y - center.y)) / (radiusY * radiusY)

    return normalized <= 1.2
  }

  if (annotation.type === 'text') {
    const bounds = getTextBounds(annotation)

    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    )
  }

  return false
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const length = 18

  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - length * Math.cos(angle - Math.PI / 6),
    end.y - length * Math.sin(angle - Math.PI / 6),
  )
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - length * Math.cos(angle + Math.PI / 6),
    end.y - length * Math.sin(angle + Math.PI / 6),
  )
  context.stroke()
}

function drawAnnotation(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
) {
  context.save()
  context.strokeStyle = annotation.color
  context.fillStyle = annotation.color
  context.lineWidth = strokeWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (annotation.type === 'draw') {
    context.beginPath()
    annotation.points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y)
      } else {
        context.lineTo(point.x, point.y)
      }
    })
    context.stroke()
  }

  if (annotation.type === 'line' || annotation.type === 'arrow') {
    context.beginPath()
    context.moveTo(annotation.start.x, annotation.start.y)
    context.lineTo(annotation.end.x, annotation.end.y)
    context.stroke()

    if (annotation.type === 'arrow') {
      drawArrowHead(context, annotation.start, annotation.end)
    }
  }

  if (annotation.type === 'rectangle') {
    const box = getBox(annotation.start, annotation.end)
    context.strokeRect(box.x, box.y, box.width, box.height)
  }

  if (annotation.type === 'circle') {
    const box = getBox(annotation.start, annotation.end)
    context.beginPath()
    context.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      Math.max(box.width / 2, 1),
      Math.max(box.height / 2, 1),
      0,
      0,
      Math.PI * 2,
    )
    context.stroke()
  }

  if (annotation.type === 'text') {
    context.font = `${annotation.fontSize}px system-ui, sans-serif`
    context.textBaseline = 'alphabetic'
    context.fillText(annotation.text, annotation.position.x, annotation.position.y)
  }

  context.restore()
}

function drawSelection(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
) {
  context.save()
  context.strokeStyle = '#0a0a0a'
  context.fillStyle = '#ffffff'
  context.lineWidth = 1
  context.setLineDash([6, 4])

  if (annotation.type === 'text') {
    const bounds = getTextBounds(annotation)
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
  } else if (annotation.type === 'rectangle' || annotation.type === 'circle') {
    const box = getBox(annotation.start, annotation.end)
    context.strokeRect(box.x, box.y, box.width, box.height)
  }

  context.setLineDash([])
  getHandles(annotation).forEach((point) => {
    context.fillRect(
      point.x - handleSize / 2,
      point.y - handleSize / 2,
      handleSize,
      handleSize,
    )
    context.strokeRect(
      point.x - handleSize / 2,
      point.y - handleSize / 2,
      handleSize,
      handleSize,
    )
  })

  context.restore()
}

function renderImage(
  image: HTMLImageElement,
  annotations: Annotation[],
  preview?: Annotation | null,
) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not render image.')
  }

  context.drawImage(image, 0, 0)
  annotations.forEach((annotation) => drawAnnotation(context, annotation))
  if (preview) {
    drawAnnotation(context, preview)
  }

  return canvas
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const interactionRef = useRef<Interaction | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [history, setHistory] = useState<Annotation[][]>([])
  const [redoStack, setRedoStack] = useState<Annotation[][]>([])
  const [preview, setPreview] = useState<Annotation | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#ef4444')
  const [message, setMessage] = useState('Paste an image to start.')

  const selectedAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  )

  const pushHistory = useCallback((previousAnnotations: Annotation[]) => {
    setHistory((current) => [
      ...current.slice(-99),
      cloneAnnotations(previousAnnotations),
    ])
    setRedoStack([])
  }, [])

  const commitAnnotations = useCallback(
    (nextAnnotations: Annotation[], previousAnnotations = annotations) => {
      pushHistory(previousAnnotations)
      setAnnotations(cloneAnnotations(nextAnnotations))
    },
    [annotations, pushHistory],
  )

  const loadImageBlob = useCallback((blob: Blob) => {
    const reader = new FileReader()

    reader.onload = () => {
      setImageSrc(String(reader.result))
      setAnnotations([])
      setHistory([])
      setRedoStack([])
      setPreview(null)
      setSelectedId(null)
      setTool('select')
      setMessage('Image ready.')
    }

    reader.readAsDataURL(blob)
  }, [])

  const pasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      setMessage('Use the browser paste shortcut to paste an image.')
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
      setMessage('Clipboard does not contain an image.')
    } catch {
      setMessage('Clipboard image access was blocked.')
    }
  }, [loadImageBlob])

  const undo = useCallback(() => {
    setHistory((currentHistory) => {
      const previous = currentHistory.at(-1)
      if (!previous) {
        return currentHistory
      }

      setRedoStack((currentRedo) => [
        cloneAnnotations(annotations),
        ...currentRedo,
      ])
      setAnnotations(cloneAnnotations(previous))
      setSelectedId(null)

      return currentHistory.slice(0, -1)
    })
  }, [annotations])

  const redo = useCallback(() => {
    setRedoStack((currentRedo) => {
      const next = currentRedo[0]
      if (!next) {
        return currentRedo
      }

      setHistory((currentHistory) => [
        ...currentHistory,
        cloneAnnotations(annotations),
      ])
      setAnnotations(cloneAnnotations(next))
      setSelectedId(null)

      return currentRedo.slice(1)
    })
  }, [annotations])

  const deleteSelected = useCallback(() => {
    if (!selectedId) {
      return
    }

    commitAnnotations(
      annotations.filter((annotation) => annotation.id !== selectedId),
    )
    setSelectedId(null)
  }, [annotations, commitAnnotations, selectedId])

  const updateSelectedColor = useCallback(
    (nextColor: string) => {
      setColor(nextColor)
      if (!selectedId) {
        return
      }

      commitAnnotations(
        annotations.map((annotation) =>
          annotation.id === selectedId
            ? { ...annotation, color: nextColor }
            : annotation,
        ),
      )
    },
    [annotations, commitAnnotations, selectedId],
  )

  const updateSelectedText = useCallback(
    (text: string) => {
      if (!selectedId) {
        return
      }

      commitAnnotations(
        annotations.map((annotation) =>
          annotation.id === selectedId && annotation.type === 'text'
            ? { ...annotation, text }
            : annotation,
        ),
      )
    },
    [annotations, commitAnnotations, selectedId],
  )

  const copyImage = useCallback(async () => {
    if (!image) {
      setMessage('Paste an image first.')
      return
    }

    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      setMessage('Clipboard image copy is not available in this browser.')
      return
    }

    try {
      const canvas = renderImage(image, annotations)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )

      if (!blob) {
        setMessage('Could not render image.')
        return
      }

      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
      setMessage('Copied annotated image.')
    } catch {
      setMessage('Clipboard copy was blocked.')
    }
  }, [annotations, image])

  const downloadImage = useCallback(() => {
    if (!image) {
      setMessage('Paste an image first.')
      return
    }

    const canvas = renderImage(image, annotations)
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'annotated-image.png'
    link.click()
    setMessage('Downloaded annotated image.')
  }, [annotations, image])

  const clearAnnotations = useCallback(() => {
    if (annotations.length === 0) {
      return
    }

    commitAnnotations([])
    setSelectedId(null)
  }, [annotations, commitAnnotations])

  const getCanvasPoint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
      if (!image || !canvasRef.current) {
        return null
      }

      const bounds = canvasRef.current.getBoundingClientRect()

      return {
        x: ((event.clientX - bounds.left) / bounds.width) * image.naturalWidth,
        y: ((event.clientY - bounds.top) / bounds.height) * image.naturalHeight,
      }
    },
    [image],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!image) {
        return
      }

      const point = getCanvasPoint(event)
      if (!point) {
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)

      if (tool === 'select') {
        const selected = selectedAnnotation
        const handleIndex = selected
          ? getHandles(selected).findIndex(
              (handle) => pointDistance(handle, point) <= 12,
            )
          : -1

        if (
          selected &&
          handleIndex >= 0 &&
          selected.type !== 'draw' &&
          selected.type !== 'text'
        ) {
          interactionRef.current = {
            kind: 'resize',
            annotationId: selected.id,
            handleIndex,
            originalAnnotations: cloneAnnotations(annotations),
          }
          return
        }

        const hit = [...annotations]
          .reverse()
          .find((annotation) => hitTest(annotation, point))

        if (hit) {
          setSelectedId(hit.id)
          setColor(hit.color)
          interactionRef.current = {
            kind: 'move',
            annotationId: hit.id,
            start: point,
            originalAnnotations: cloneAnnotations(annotations),
          }
        } else {
          setSelectedId(null)
        }

        return
      }

      const id = crypto.randomUUID()

      if (tool === 'draw') {
        const annotation: DrawAnnotation = {
          id,
          type: 'draw',
          color,
          points: [point],
        }
        interactionRef.current = { kind: 'draw', annotation }
        setPreview(annotation)
        return
      }

      if (tool === 'text') {
        const annotation: TextAnnotation = {
          id,
          type: 'text',
          color,
          position: point,
          text: 'Text',
          fontSize: textFontSize,
        }
        commitAnnotations([...annotations, annotation])
        setSelectedId(id)
        setTool('select')
        return
      }

      const annotation: LineAnnotation | BoxAnnotation = {
        id,
        type: tool,
        color,
        start: point,
        end: point,
      }
      interactionRef.current = { kind: 'create', annotation }
      setPreview(annotation)
    },
    [
      annotations,
      color,
      commitAnnotations,
      getCanvasPoint,
      image,
      selectedAnnotation,
      tool,
    ],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(event)
      const interaction = interactionRef.current

      if (!point || !interaction) {
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
        const next = { ...interaction.annotation, end: point }
        interactionRef.current = { kind: 'create', annotation: next }
        setPreview(next)
        return
      }

      if (interaction.kind === 'move') {
        const delta = {
          x: point.x - interaction.start.x,
          y: point.y - interaction.start.y,
        }
        setAnnotations(
          interaction.originalAnnotations.map((annotation) =>
            annotation.id === interaction.annotationId
              ? moveAnnotation(annotation, delta)
              : annotation,
          ),
        )
        return
      }

      setAnnotations(
        interaction.originalAnnotations.map((annotation) =>
          annotation.id === interaction.annotationId
            ? resizeAnnotation(annotation, interaction.handleIndex, point)
            : annotation,
        ),
      )
    },
    [getCanvasPoint],
  )

  const handlePointerUp = useCallback(() => {
    const interaction = interactionRef.current

    if (!interaction) {
      return
    }

    if (interaction.kind === 'draw') {
      if (interaction.annotation.points.length > 1) {
        commitAnnotations([...annotations, interaction.annotation])
        setSelectedId(interaction.annotation.id)
      }
      setPreview(null)
      interactionRef.current = null
      return
    }

    if (interaction.kind === 'create') {
      if (pointDistance(interaction.annotation.start, interaction.annotation.end) > 4) {
        commitAnnotations([...annotations, interaction.annotation])
        setSelectedId(interaction.annotation.id)
      }
      setPreview(null)
      interactionRef.current = null
      return
    }

    const changed =
      JSON.stringify(interaction.originalAnnotations) !==
      JSON.stringify(annotations)
    if (changed) {
      pushHistory(interaction.originalAnnotations)
    }
    interactionRef.current = null
  }, [annotations, commitAnnotations, pushHistory])

  useEffect(() => {
    if (!imageSrc) {
      setImage(null)
      return
    }

    const nextImage = new Image()
    nextImage.onload = () => setImage(nextImage)
    nextImage.src = imageSrc
  }, [imageSrc])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith('image/'),
      )

      const file = item?.getAsFile()
      if (!file) {
        return
      }

      event.preventDefault()
      loadImageBlob(file)
    }

    window.addEventListener('paste', onPaste)

    return () => window.removeEventListener('paste', onPaste)
  }, [loadImageBlob])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      }

      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return
        }
        deleteSelected()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelected, redo, undo])

  useEffect(() => {
    if (!canvasRef.current || !image) {
      return
    }

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const scale = window.devicePixelRatio || 1
    canvas.width = image.naturalWidth * scale
    canvas.height = image.naturalHeight * scale
    canvas.style.width = `${image.naturalWidth}px`
    canvas.style.height = `${image.naturalHeight}px`

    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.clearRect(0, 0, image.naturalWidth, image.naturalHeight)
    context.drawImage(image, 0, 0)
    annotations.forEach((annotation) => drawAnnotation(context, annotation))
    if (preview) {
      drawAnnotation(context, preview)
    }

    const selected = annotations.find(
      (annotation) => annotation.id === selectedId,
    )
    if (selected) {
      drawSelection(context, selected)
    }
  }, [annotations, image, preview, selectedId])

  return (
    <main className="flex min-h-screen flex-col bg-white text-neutral-950">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="flex items-center gap-1">
          {tools.map((item) => {
            const Icon = item.icon

            return (
              <Button
                key={item.id}
                type="button"
                variant={tool === item.id ? 'default' : 'outline'}
                size="icon"
                aria-label={item.label}
                title={item.label}
                onClick={() => setTool(item.id)}
              >
                <Icon />
              </Button>
            )
          })}
        </div>

        <Separator className="hidden h-9 w-px sm:block" data-orientation="vertical" />

        <div className="flex items-center gap-2">
          <Label htmlFor="annotation-color">Color</Label>
          <Input
            id="annotation-color"
            className="h-9 w-14 p-1"
            type="color"
            value={color}
            onChange={(event) => updateSelectedColor(event.target.value)}
          />
        </div>

        {selectedAnnotation?.type === 'text' ? (
          <Input
            className="w-48"
            aria-label="Text"
            value={selectedAnnotation.text}
            onChange={(event) => updateSelectedText(event.target.value)}
          />
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Undo"
            title="Undo"
            disabled={history.length === 0}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Redo"
            title="Redo"
            disabled={redoStack.length === 0}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Delete selected"
            title="Delete selected"
            disabled={!selectedId}
            onClick={deleteSelected}
          >
            <Trash2 />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => void pasteFromClipboard()}
          >
            <ClipboardPaste />
            Paste
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!image}
            onClick={() => void copyImage()}
          >
            <ClipboardCopy />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!image}
            onClick={downloadImage}
          >
            <Download />
            Download
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={annotations.length === 0}
            onClick={clearAnnotations}
          >
            Clear
          </Button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-neutral-200 px-3 py-2 text-sm text-neutral-600">
          {message}
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto bg-neutral-50',
            !image && 'grid place-items-center',
          )}
        >
          {image ? (
            <canvas
              ref={canvasRef}
              className="block cursor-crosshair bg-white"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-neutral-300 bg-white p-6 text-center">
              <p className="text-sm text-neutral-600">
                Paste an image to start annotating.
              </p>
              <Button type="button" onClick={() => void pasteFromClipboard()}>
                <ClipboardPaste />
                Paste image
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
