import { cabinet } from '../core/config'

export function placeOnCabinet(element: HTMLElement, bounds: { x: number; y: number; width: number; height: number }) {
  element.style.left = bounds.x / cabinet.width * 100 + '%'
  element.style.top = bounds.y / cabinet.height * 100 + '%'
  element.style.width = bounds.width / cabinet.width * 100 + '%'
  element.style.height = bounds.height / cabinet.height * 100 + '%'
}
