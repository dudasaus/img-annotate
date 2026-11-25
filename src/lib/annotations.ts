export type Point = {
  x: number
  y: number
}

export type ShapeType = 'line' | 'arrow' | 'rectangle' | 'circle'
export type Tool = 'select' | 'draw' | ShapeType | 'text'
export type SizeOption = 'S' | 'M' | 'L'
export type TextStyle = 'outline' | 'label'

export type DrawAnnotation = {
  id: string
  type: 'draw'
  color: string
  strokeWidth: number
  points: Point[]
}

export type LineAnnotation = {
  id: string
  type: 'line' | 'arrow'
  color: string
  strokeWidth: number
  start: Point
  end: Point
}

export type BoxAnnotation = {
  id: string
  type: 'rectangle' | 'circle'
  color: string
  strokeWidth: number
  start: Point
  end: Point
}

export type TextAnnotation = {
  id: string
  type: 'text'
  color: string
  /** Top-left corner of the text box, including padding. */
  position: Point
  text: string
  fontSize: number
  style: TextStyle
}

export type Annotation =
  | DrawAnnotation
  | LineAnnotation
  | BoxAnnotation
  | TextAnnotation

export type HandleId =
  | 'start'
  | 'end'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'

export type Handle = { id: HandleId; point: Point }

/** Returns the rendered width of a single line of text. */
export type MeasureText = (text: string, fontSize: number) => number

export const textFontFamily =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
export const textLineHeight = 1.25

export function getTextFont(fontSize: number) {
  return `600 ${fontSize}px ${textFontFamily}`
}

let measurementContext: CanvasRenderingContext2D | null | undefined

export const measureText: MeasureText = (text, fontSize) => {
  if (measurementContext === undefined) {
    measurementContext =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d')
  }

  if (!measurementContext) {
    return text.length * fontSize * 0.58
  }

  measurementContext.font = getTextFont(fontSize)
  return measurementContext.measureText(text).width
}

export function getSizePresets(width: number, height: number) {
  const unit = Math.min(width, height)

  return {
    stroke: {
      S: Math.max(1.5, unit * 0.003),
      M: Math.max(3, unit * 0.005),
      L: Math.max(5, unit * 0.009),
    } satisfies Record<SizeOption, number>,
    font: {
      S: Math.max(12, unit * 0.02),
      M: Math.max(16, unit * 0.03),
      L: Math.max(22, unit * 0.05),
    } satisfies Record<SizeOption, number>,
  }
}

export function pointDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export function distanceToSegment(point: Point, start: Point, end: Point) {
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2
  if (lengthSquared === 0) {
    return pointDistance(point, start)
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * (end.x - start.x) +
        (point.y - start.y) * (end.y - start.y)) /
        lengthSquared,
    ),
  )

  return pointDistance(point, {
    x: start.x + progress * (end.x - start.x),
    y: start.y + progress * (end.y - start.y),
  })
}

export function getBox(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

export function getTextLayout(annotation: TextAnnotation, measure: MeasureText) {
  const lines = annotation.text.split('\n')
  const lineHeight = annotation.fontSize * textLineHeight
  const padding =
    annotation.fontSize * (annotation.style === 'label' ? 0.35 : 0.12)
  const textWidth = Math.max(
    ...lines.map((line) => measure(line, annotation.fontSize)),
  )

  return {
    x: annotation.position.x,
    y: annotation.position.y,
    width: textWidth + padding * 2,
    height: lines.length * lineHeight + padding * 2,
    lines,
    lineHeight,
    padding,
  }
}

export function getBounds(annotation: Annotation, measure: MeasureText) {
  if (annotation.type === 'text') {
    const { x, y, width, height } = getTextLayout(annotation, measure)
    return { x, y, width, height }
  }

  if (annotation.type === 'draw') {
    const xs = annotation.points.map((point) => point.x)
    const ys = annotation.points.map((point) => point.y)
    return getBox(
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
    )
  }

  return getBox(annotation.start, annotation.end)
}

const boxHandleIds = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

function getBoxHandlePoint(
  box: { x: number; y: number; width: number; height: number },
  id: HandleId,
): Point {
  const x = id.includes('w')
    ? box.x
    : id.includes('e')
      ? box.x + box.width
      : box.x + box.width / 2
  const y = id.includes('n')
    ? box.y
    : id.includes('s')
      ? box.y + box.height
      : box.y + box.height / 2

  return { x, y }
}

export function getHandles(
  annotation: Annotation,
  measure: MeasureText,
): Handle[] {
  if (annotation.type === 'line' || annotation.type === 'arrow') {
    return [
      { id: 'start', point: annotation.start },
      { id: 'end', point: annotation.end },
    ]
  }

  if (annotation.type === 'rectangle' || annotation.type === 'circle') {
    const box = getBox(annotation.start, annotation.end)
    return boxHandleIds.map((id) => ({ id, point: getBoxHandlePoint(box, id) }))
  }

  if (annotation.type === 'text') {
    const layout = getTextLayout(annotation, measure)
    return (['nw', 'ne', 'se', 'sw'] as const).map((id) => ({
      id,
      point: getBoxHandlePoint(layout, id),
    }))
  }

  return []
}

export function getHandleCursor(id: HandleId) {
  switch (id) {
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    default:
      return 'move'
  }
}

export function constrainPoint(
  origin: Point,
  point: Point,
  mode: 'angle' | 'square',
): Point {
  const dx = point.x - origin.x
  const dy = point.y - origin.y

  if (mode === 'square') {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    return {
      x: origin.x + size * (Math.sign(dx) || 1),
      y: origin.y + size * (Math.sign(dy) || 1),
    }
  }

  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const length = Math.hypot(dx, dy)

  return {
    x: origin.x + Math.cos(angle) * length,
    y: origin.y + Math.sin(angle) * length,
  }
}

export function moveAnnotation(annotation: Annotation, delta: Point): Annotation {
  const shift = (point: Point) => ({ x: point.x + delta.x, y: point.y + delta.y })

  if (annotation.type === 'draw') {
    return { ...annotation, points: annotation.points.map(shift) }
  }

  if (annotation.type === 'text') {
    return { ...annotation, position: shift(annotation.position) }
  }

  return {
    ...annotation,
    start: shift(annotation.start),
    end: shift(annotation.end),
  }
}

export function resizeAnnotation(
  annotation: Annotation,
  handle: HandleId,
  point: Point,
  options: { measure: MeasureText; constrain?: boolean },
): Annotation {
  if (annotation.type === 'line' || annotation.type === 'arrow') {
    const fixed = handle === 'start' ? annotation.end : annotation.start
    const moved = options.constrain ? constrainPoint(fixed, point, 'angle') : point
    return handle === 'start'
      ? { ...annotation, start: moved }
      : { ...annotation, end: moved }
  }

  if (annotation.type === 'rectangle' || annotation.type === 'circle') {
    const box = getBox(annotation.start, annotation.end)
    let left = box.x
    let top = box.y
    let right = box.x + box.width
    let bottom = box.y + box.height

    if (handle.includes('w')) left = point.x
    if (handle.includes('e')) right = point.x
    if (handle.includes('n')) top = point.y
    if (handle.includes('s')) bottom = point.y

    const isCorner = handle.length === 2
    if (options.constrain && isCorner) {
      const anchor = {
        x: handle.includes('w') ? right : left,
        y: handle.includes('n') ? bottom : top,
      }
      const corner = constrainPoint(anchor, point, 'square')
      return { ...annotation, start: anchor, end: corner }
    }

    return {
      ...annotation,
      start: { x: left, y: top },
      end: { x: right, y: bottom },
    }
  }

  if (annotation.type === 'text') {
    const layout = getTextLayout(annotation, options.measure)
    const growsEast = handle.includes('e')
    const growsSouth = handle.includes('s')
    const anchor = {
      x: growsEast ? layout.x : layout.x + layout.width,
      y: growsSouth ? layout.y : layout.y + layout.height,
    }
    const scale = Math.max(
      0.1,
      Math.max(
        Math.abs(point.x - anchor.x) / layout.width,
        Math.abs(point.y - anchor.y) / layout.height,
      ),
    )
    const fontSize = Math.max(8, annotation.fontSize * scale)
    const appliedScale = fontSize / annotation.fontSize
    const width = layout.width * appliedScale
    const height = layout.height * appliedScale

    return {
      ...annotation,
      fontSize,
      position: {
        x: growsEast ? anchor.x : anchor.x - width,
        y: growsSouth ? anchor.y : anchor.y - height,
      },
    }
  }

  return annotation
}

export function hitTest(
  annotation: Annotation,
  point: Point,
  tolerance: number,
  measure: MeasureText,
) {
  if (annotation.type === 'text') {
    const layout = getTextLayout(annotation, measure)
    return (
      point.x >= layout.x - tolerance &&
      point.x <= layout.x + layout.width + tolerance &&
      point.y >= layout.y - tolerance &&
      point.y <= layout.y + layout.height + tolerance
    )
  }

  const reach = tolerance + annotation.strokeWidth / 2

  if (annotation.type === 'draw') {
    return annotation.points.some((current, index) => {
      const previous = annotation.points[index - 1] ?? current
      return distanceToSegment(point, previous, current) <= reach
    })
  }

  if (annotation.type === 'line' || annotation.type === 'arrow') {
    return distanceToSegment(point, annotation.start, annotation.end) <= reach
  }

  const box = getBox(annotation.start, annotation.end)

  if (annotation.type === 'rectangle') {
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ]
    return corners.some(
      (corner, index) =>
        distanceToSegment(point, corner, corners[(index + 1) % 4]) <= reach,
    )
  }

  const radiusX = Math.max(box.width / 2, 1)
  const radiusY = Math.max(box.height / 2, 1)
  const normalized = Math.hypot(
    (point.x - (box.x + radiusX)) / radiusX,
    (point.y - (box.y + radiusY)) / radiusY,
  )

  return Math.abs(normalized - 1) * Math.min(radiusX, radiusY) <= reach
}

export function findAnnotationAt(
  annotations: Annotation[],
  point: Point,
  tolerance: number,
  measure: MeasureText,
) {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    if (hitTest(annotations[index], point, tolerance, measure)) {
      return annotations[index]
    }
  }

  return null
}

export function findHandleAt(
  annotation: Annotation | null,
  point: Point,
  tolerance: number,
  measure: MeasureText,
) {
  if (!annotation) {
    return null
  }

  return (
    getHandles(annotation, measure).find(
      (handle) => pointDistance(handle.point, point) <= tolerance,
    ) ?? null
  )
}

export function getContrastColor(color: string) {
  const hex = color.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((character) => character + character)
          .join('')
      : hex
  const [red, green, blue] = [0, 2, 4].map(
    (offset) => parseInt(full.slice(offset, offset + 2), 16) / 255,
  )
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue

  return luminance > 0.55 ? '#000000' : '#ffffff'
}
