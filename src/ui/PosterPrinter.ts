import { posterSize, type Poster } from '../capsule/PosterLayout'
import { posterElement } from './PosterWall'

export async function printPoster(slot: HTMLElement, poster: Poster, dialog: HTMLDialogElement,
  openEditor: () => { view: HTMLElement; rays: HTMLElement }) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const outlet = slot.getBoundingClientRect()
  const paper = document.createElement('div')
  const artwork = posterElement(poster)
  paper.className = 'printing-paper'
  paper.setAttribute('aria-hidden', 'true')
  paper.append(artwork)
  const width = outlet.width * 0.9
  const height = width * posterSize.height / posterSize.width
  const left = outlet.left + (outlet.width - width) / 2
  const top = outlet.bottom - 1
  paper.style.left = left + 'px'
  paper.style.top = top + 'px'
  paper.style.width = width + 'px'
  paper.style.height = height + 'px'
  document.body.append(paper)
  try {
    const feedMs = 990
    const plans = [
      [[0.21, 200], [0.64, 400]],
      [[0.31, 400], [0.79, 200]],
      [[0.43, 200], [0.87, 400]],
    ]
    const stops = plans[Math.floor(Math.random() * plans.length)]
    const duration = feedMs + 600
    const feed: Keyframe[] = [{ transform: 'translateY(-100%)', offset: 0 }]
    let paused = 0
    for (const [stop, delay] of stops) {
      const transform = `translateY(${(stop - 1) * 100}%)`
      const start = stop * feedMs + paused
      paused += delay
      feed.push(
        { transform, offset: start / duration },
        { transform, offset: (start + delay) / duration },
      )
    }
    feed.push({ transform: 'translateY(0)', offset: 1 })
    await artwork.animate(feed, { duration, easing: 'linear', fill: 'forwards' }).finished

    const { view, rays } = openEditor()
    const destination = view.getBoundingClientRect()
    const scale = destination.width / width
    const x = destination.left - left
    const y = destination.top - top
    dialog.append(paper)
    paper.dataset.flying = ''
    const flight = { duration: 660, easing: getComputedStyle(paper).getPropertyValue('--ease-out').trim(), fill: 'forwards' } as const
    const paperFlight = paper.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: `translate(${x}px, ${y}px) scale(${scale})` },
    ], flight)
    // The glow uses the same trajectory as the paper, in the editor's coordinate space.
    const glowFlight = rays.animate([
      { transform: `translate(${-x}px, ${-y}px) scale(${1 / scale})` },
      { transform: 'translate(0, 0) scale(1)' },
    ], flight)
    const glowFade = rays.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: flight.duration, easing: 'ease-in-out', fill: 'forwards',
    })
    await paperFlight.finished
    glowFlight.cancel()
    glowFade.cancel()

  } finally {
    paper.remove()
  }
}
