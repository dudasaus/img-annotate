import {
  type Annotation,
  type MeasureText,
  type Point,
  getBounds,
  getContrastColor,
  getHandles,
  getTextFont,
  getTextLayout,
} from './annotations'

const accent = '#0ea5e9'

function drawArrow(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  strokeWidth: number,
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const headLength = Math.min(Math.max(10, strokeWidth * 4), length * 0.6)
  const spread = Math.PI / 7
  const shaftEnd = {
    x: end.x - Math.cos(angle) * headLength * 0.7,
    y: end.y - Math.sin(angle) * headLength * 0.7,
  }

  context.beginPath()
  context.moveTo(start.x, start.y)
  context.lineTo(shaftEnd.x, shaftEnd.y)
  context.stroke()

  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - headLength * Math.cos(angle - spread),
    end.y - headLength * Math.sin(angle - spread),
  )
  context.lineTo(
    end.x - headLength * Math.cos(angle + spread),
    end.y - headLength * Math.sin(angle + spread),
  )
  context.closePath()
  context.fill()
}

export function drawAnnotation(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
  measure: MeasureText,
) {
  context.save()
  context.strokeStyle = annotation.color
  context.fillStyle = annotation.color
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (annotation.type === 'text') {
    if (annotation.text.trim() === '') {
      context.restore()
      return
    }

    const layout = getTextLayout(annotation, measure)
    const contrast = getContrastColor(annotation.color)
    context.font = getTextFont(annotation.fontSize)
    context.textBaseline = 'middle'

    if (annotation.style === 'label') {
      context.beginPath()
      context.roundRect(
        layout.x,
        layout.y,
        layout.width,
        layout.height,
        annotation.fontSize * 0.25,
      )
      context.fill()
      context.fillStyle = contrast
    } else {
      context.strokeStyle = contrast
      context.lineWidth = annotation.fontSize * 0.16
    }

    layout.lines.forEach((line, index) => {
      const x = layout.x + layout.padding
      const y = layout.y + layout.padding + layout.lineHeight * (index + 0.5)
      if (annotation.style === 'outline') {
        context.strokeText(line, x, y)
      }
      context.fillText(line, x, y)
    })

    context.restore()
    return
  }

  context.lineWidth = annotation.strokeWidth

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
  } else if (annotation.type === 'arrow') {
    drawArrow(context, annotation.start, annotation.end, annotation.strokeWidth)
  } else if (annotation.type === 'line') {
    context.beginPath()
    context.moveTo(annotation.start.x, annotation.start.y)
    context.lineTo(annotation.end.x, annotation.end.y)
    context.stroke()
  } else {
    const box = getBounds(annotation, measure)
    context.beginPath()
    if (annotation.type === 'rectangle') {
      context.rect(box.x, box.y, box.width, box.height)
    } else {
      context.ellipse(
        box.x + box.width / 2,
        box.y + box.height / 2,
        Math.max(box.width / 2, 1),
        Math.max(box.height / 2, 1),
        0,
        0,
        Math.PI * 2,
      )
    }
    context.stroke()
  }

  context.restore()
}

/** `pixel` is the size of one screen pixel in image coordinates. */
export function drawHover(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
  measure: MeasureText,
  pixel: number,
) {
  const bounds = getBounds(annotation, measure)
  const pad = 4 * pixel

  context.save()
  context.strokeStyle = accent
  context.globalAlpha = 0.6
  context.lineWidth = pixel
  context.strokeRect(
    bounds.x - pad,
    bounds.y - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2,
  )
  context.restore()
}

export function drawSelection(
  context: CanvasRenderingContext2D,
  annotation: Annotation,
  measure: MeasureText,
  pixel: number,
) {
  context.save()
  context.strokeStyle = accent
  context.lineWidth = pixel

  if (annotation.type !== 'line' && annotation.type !== 'arrow') {
    const bounds = getBounds(annotation, measure)
    if (annotation.type === 'draw') {
      const pad = 4 * pixel
      context.setLineDash([4 * pixel, 3 * pixel])
      context.strokeRect(
        bounds.x - pad,
        bounds.y - pad,
        bounds.width + pad * 2,
        bounds.height + pad * 2,
      )
      context.setLineDash([])
    } else {
      context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    }
  }

  const size = 9 * pixel
  context.fillStyle = '#ffffff'
  context.lineWidth = 1.5 * pixel
  getHandles(annotation, measure).forEach(({ id, point }) => {
    context.beginPath()
    if (id === 'start' || id === 'end') {
      context.arc(point.x, point.y, size / 2, 0, Math.PI * 2)
    } else {
      context.roundRect(point.x - size / 2, point.y - size / 2, size, size, 2 * pixel)
    }
    context.fill()
    context.stroke()
  })

  context.restore()
}

export function renderImage(
  image: HTMLImageElement,
  annotations: Annotation[],
  measure: MeasureText,
) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not render image.')
  }

  context.drawImage(image, 0, 0)
  annotations.forEach((annotation) => drawAnnotation(context, annotation, measure))

  return canvas
}
