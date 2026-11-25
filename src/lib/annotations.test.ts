import { describe, expect, it } from 'vitest'

import {
  type BoxAnnotation,
  type LineAnnotation,
  type TextAnnotation,
  constrainPoint,
  getContrastColor,
  getHandles,
  getSizePresets,
  getTextLayout,
  hitTest,
  resizeAnnotation,
} from './annotations'

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5

const box: BoxAnnotation = {
  id: 'b',
  type: 'rectangle',
  color: '#f00',
  strokeWidth: 4,
  start: { x: 0, y: 0 },
  end: { x: 100, y: 50 },
}

const text: TextAnnotation = {
  id: 't',
  type: 'text',
  color: '#f00',
  position: { x: 10, y: 20 },
  text: 'ab\nabcd',
  fontSize: 20,
  style: 'outline',
}

describe('getSizePresets', () => {
  it('scales with the shorter image side', () => {
    const small = getSizePresets(800, 600)
    const large = getSizePresets(3200, 2400)

    expect(large.stroke.M).toBeCloseTo(small.stroke.M * 4)
    expect(large.font.M).toBeCloseTo(small.font.M * 4)
    expect(small.stroke.S).toBeLessThan(small.stroke.M)
    expect(small.stroke.M).toBeLessThan(small.stroke.L)
  })

  it('keeps sizes usable on tiny images', () => {
    const tiny = getSizePresets(100, 80)

    expect(tiny.stroke.S).toBeGreaterThanOrEqual(1.5)
    expect(tiny.font.S).toBeGreaterThanOrEqual(12)
  })
})

describe('box handles', () => {
  it('exposes eight handles', () => {
    expect(getHandles(box, measure).map((handle) => handle.id)).toEqual([
      'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w',
    ])
  })

  it('edge handles move one edge only', () => {
    const resized = resizeAnnotation(box, 'e', { x: 150, y: 999 }, { measure })
    expect(resized).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 150, y: 50 } })
  })

  it('corner handles move two edges', () => {
    const resized = resizeAnnotation(box, 'nw', { x: -10, y: -20 }, { measure })
    expect(resized).toMatchObject({ start: { x: -10, y: -20 }, end: { x: 100, y: 50 } })
  })

  it('constrained corner resize keeps a square', () => {
    const resized = resizeAnnotation(box, 'se', { x: 80, y: 30 }, {
      measure,
      constrain: true,
    }) as BoxAnnotation

    expect(resized.end.x - resized.start.x).toBe(resized.end.y - resized.start.y)
  })
})

describe('line handles', () => {
  const line: LineAnnotation = {
    id: 'l',
    type: 'arrow',
    color: '#f00',
    strokeWidth: 4,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
  }

  it('moves an endpoint', () => {
    expect(resizeAnnotation(line, 'end', { x: 40, y: 30 }, { measure })).toMatchObject({
      end: { x: 40, y: 30 },
    })
  })

  it('constrains endpoint angle relative to the other end', () => {
    const resized = resizeAnnotation(line, 'end', { x: 100, y: 10 }, {
      measure,
      constrain: true,
    }) as LineAnnotation

    expect(resized.end.y).toBeCloseTo(0)
  })
})

describe('text', () => {
  it('lays out multiple lines', () => {
    const layout = getTextLayout(text, measure)

    expect(layout.lines).toEqual(['ab', 'abcd'])
    expect(layout.height).toBeCloseTo(layout.lineHeight * 2 + layout.padding * 2)
    expect(layout.width).toBeCloseTo(measure('abcd', 20) + layout.padding * 2)
    expect(layout.x).toBe(10)
    expect(layout.y).toBe(20)
  })

  it('label style adds more padding than outline', () => {
    const outline = getTextLayout(text, measure)
    const label = getTextLayout({ ...text, style: 'label' }, measure)

    expect(label.padding).toBeGreaterThan(outline.padding)
  })

  it('corner resize scales the font and keeps the opposite corner fixed', () => {
    const before = getTextLayout(text, measure)
    const resized = resizeAnnotation(
      text,
      'se',
      { x: before.x + before.width * 2, y: before.y + before.height * 2 },
      { measure },
    ) as TextAnnotation
    const after = getTextLayout(resized, measure)

    expect(resized.fontSize).toBeCloseTo(40)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('resizing from the top-left keeps the bottom-right fixed', () => {
    const before = getTextLayout(text, measure)
    const resized = resizeAnnotation(
      text,
      'nw',
      { x: before.x + before.width / 2, y: before.y + before.height / 2 },
      { measure },
    ) as TextAnnotation
    const after = getTextLayout(resized, measure)

    expect(after.x + after.width).toBeCloseTo(before.x + before.width)
    expect(after.y + after.height).toBeCloseTo(before.y + before.height)
  })
})

describe('hitTest', () => {
  it('hits rectangle outlines but not interiors', () => {
    expect(hitTest(box, { x: 50, y: 2 }, 6, measure)).toBe(true)
    expect(hitTest(box, { x: 50, y: 25 }, 6, measure)).toBe(false)
  })

  it('hits ellipse outlines but not interiors', () => {
    const circle: BoxAnnotation = { ...box, type: 'circle', end: { x: 100, y: 100 } }

    expect(hitTest(circle, { x: 100, y: 50 }, 6, measure)).toBe(true)
    expect(hitTest(circle, { x: 50, y: 50 }, 6, measure)).toBe(false)
  })

  it('hits anywhere inside text', () => {
    const layout = getTextLayout(text, measure)
    expect(
      hitTest(text, { x: layout.x + layout.width / 2, y: layout.y + layout.height / 2 }, 0, measure),
    ).toBe(true)
  })
})

describe('constrainPoint', () => {
  it('snaps angles to 45 degrees', () => {
    const snapped = constrainPoint({ x: 0, y: 0 }, { x: 100, y: 90 }, 'angle')
    expect(snapped.x).toBeCloseTo(snapped.y)
  })

  it('squares boxes keeping direction', () => {
    expect(constrainPoint({ x: 0, y: 0 }, { x: -30, y: 80 }, 'square')).toEqual({
      x: -80,
      y: 80,
    })
  })
})

describe('getContrastColor', () => {
  it('returns dark for light colors and light for dark colors', () => {
    expect(getContrastColor('#ffff00')).toBe('#000000')
    expect(getContrastColor('#1d4ed8')).toBe('#ffffff')
  })
})
