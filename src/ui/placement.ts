export function place(element: HTMLElement, bounds: { x: number; y: number; width: number; height: number }) {
  element.style.left = bounds.x + 'px'
  element.style.top = bounds.y + 'px'
  element.style.width = bounds.width + 'px'
  element.style.height = bounds.height + 'px'
}
