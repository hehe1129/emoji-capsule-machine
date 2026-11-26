import { posterSize, type Poster } from '../capsule/PosterLayout'
import { posterElement } from './PosterWall'

export async function printPoster(slot: HTMLElement, poster: Poster) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const outlet = slot.getBoundingClientRect()
  const paper = document.createElement('div')
  const artwork = posterElement(poster)
  paper.className = 'printing-paper'
  paper.setAttribute('aria-hidden', 'true')
  paper.append(artwork)
  const width = outlet.width * 0.90
  const height = width * posterSize.height / posterSize.width
  const left = outlet.left + (outlet.width - width) / 2
  paper.style.left = left + 'px'
  paper.style.top = outlet.bottom - 1 + 'px'
  paper.style.width = width + 'px'
  paper.style.height = height + 'px'
  document.body.append(paper)
  try {
    const feed = artwork.animate([
      { transform: 'translateY(-100%)' },
      { transform: 'translateY(-92%)', offset: 0.12 },
      { transform: 'translateY(-51%)', offset: 0.52 },
      { transform: 'translateY(0)' },
    ], { duration: 990, easing: 'linear' })
    await feed.finished
    const target = Math.min(innerHeight * 0.43, innerWidth * 0.86)
    const targetHeight = target * posterSize.height / posterSize.width
    const x = (innerWidth - target) / 2 - left
    const y = (innerHeight - targetHeight - 92) / 2 - (outlet.bottom - 1)
    paper.dataset.flying = ''
    await paper.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: 'translate(' + x + 'px,' + y + 'px) scale(' + target / width + ')' },
    ], { duration: 660, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).finished
  } finally {
    paper.remove()
  }
}
