import { arena, hatchStart, settingsSchema, type Settings } from '../core/config'
import { emojiImage } from '../emoji/emojiImage'
import type { CapsuleResult } from '../capsule/CapsuleResult'
import type { Point } from '../input/InputManager'
import type { HandCalibration } from '../input/GestureFilter'
import type { HandStatus } from '../input/HandTracking'
import type { CameraDevice } from '../input/CameraCapture'
import { CapsuleLever } from './CapsuleLever'
import { ChannelControls } from './ChannelControls'
import type { EmojiChannels } from '../emoji/EmojiChannels'

const buttonGraceMs = 220
const buttonGraceDistance = 28
const handStatusText: Record<HandStatus, string> = {
  permission: '等待摄像头权限…',
  starting: '摄像头已连接，正在等待第一帧画面…',
  loading: '正在加载本地手势模型…',
  'no-frames': '摄像头已连接，但没有新画面。请检查调试预览，或切回鼠标后重新启用摄像头。',
  'dark-frames': '摄像头正在传送几乎全黑的画面。请检查镜头是否遮住、摄像头隐私开关和室内光线。',
  'model-error': '已收到摄像头画面，手势模型加载失败。请刷新页面后重试。',
  'inference-error': '已收到摄像头画面，手势识别已中断。请重新连接摄像头。',
  seeking: '画面已连接，等待手掌入镜。',
  hover: '已定位手掌，先分开拇指与食指。',
  open: '移动手掌，捏合拇指与食指以抓取。',
  pinch: '已捏合，分开手指以松开。',
}

function element<T extends HTMLElement>(id: string) {
  const node = document.getElementById(id)
  if (!node) throw new Error('页面缺少必要元素 ' + id)
  return node as T
}

export class UIManager {
  readonly surface = element('machine')
  readonly playfield = element('playfield')
  readonly lever: CapsuleLever
  readonly channels: ChannelControls
  readonly take = element<HTMLButtonElement>('take')
  private readonly cabinet = element('cabinet')
  private readonly gate = element('retention-gate')
  private readonly retention = element('retention')
  private readonly souvenir = element<HTMLDialogElement>('souvenir')
  private readonly cardPreview = element<HTMLImageElement>('souvenir-preview')
  private readonly download = element<HTMLAnchorElement>('save-card')
  private readonly cursor = element('cursor')
  private readonly cameraToggle = element<HTMLButtonElement>('camera-toggle')
  private readonly cameraStatus = element('camera-status')
  private readonly handStatus = element('hand-status')
  private readonly handReconnect = element<HTMLButtonElement>('hand-reconnect')
  private readonly handDevice = element<HTMLSelectElement>('hand-device')
  private readonly notice = element('notice')
  private displayed: CapsuleResult[] = []
  private hoveredControl?: HTMLElement
  private lastButtonAim?: { control: HTMLElement; time: number }
  private cardUrl?: string

  constructor(
    settings: Settings,
    channels: EmojiChannels,
    onChange: () => void,
    onShake: () => void,
    onTake: () => void,
  ) {
    this.cabinet.style.setProperty('--hatch-start', String(hatchStart))
    this.channels = new ChannelControls(element('channels'), channels)
    this.lever = new CapsuleLever(element<HTMLButtonElement>('draw'), onShake)
    this.take.addEventListener('click', onTake)
    element('close-card').addEventListener('click', () => this.souvenir.close())
    this.souvenir.addEventListener('close', () => {
      this.surface.append(this.cursor)
      this.cancelCursor()
      if (this.cardUrl) URL.revokeObjectURL(this.cardUrl)
      this.cardUrl = undefined
      this.cardPreview.removeAttribute('src')
      this.download.removeAttribute('href')
    })
    const debug = element('debug')
    debug.hidden = new URLSearchParams(location.search).get('exhibit') === '1'
    for (const key of Object.keys(settingsSchema) as (keyof Settings)[]) {
      const entry = settingsSchema[key]
      const label = document.createElement('label')
      const output = document.createElement('output')
      const slider = document.createElement('input')
      slider.id = 'setting-' + key
      label.htmlFor = slider.id
      output.htmlFor.add(slider.id)
      slider.type = 'range'
      slider.min = String(entry.min)
      slider.max = String(entry.max)
      slider.step = String(entry.step)
      slider.value = output.value = String(settings[key])
      label.append(entry.label, output, slider)
      slider.addEventListener('input', () => {
        settings[key] = slider.valueAsNumber
        output.value = slider.value
        onChange()
      })
      element('settings').append(label)
    }
  }

  ready() {
    this.lever.button.disabled = false
    this.cameraToggle.disabled = false
    this.handReconnect.disabled = false
    this.channels.ready()
  }

  error(message: string) {
    const error = element('empty-message')
    error.textContent = message
    error.hidden = false
  }

  showCard(blob: Blob) {
    if (this.cardUrl) URL.revokeObjectURL(this.cardUrl)
    this.cardUrl = URL.createObjectURL(blob)
    this.cardPreview.src = this.download.href = this.cardUrl
    if (!this.souvenir.open) {
      this.souvenir.showModal()
      this.souvenir.append(this.cursor)
      this.cancelCursor()
    }
  }

  bindCamera(calibration: HandCalibration, toggle: () => void, reconnect: () => void) {
    this.cameraToggle.addEventListener('click', toggle)
    this.handReconnect.addEventListener('click', reconnect)
    const mirror = element<HTMLInputElement>('hand-mirror')
    const preview = element('hand-preview')
    mirror.checked = calibration.mirror
    preview.classList.toggle('mirrored', mirror.checked)
    mirror.addEventListener('change', () => {
      calibration.mirror = mirror.checked
      preview.classList.toggle('mirrored', mirror.checked)
    })
    const fields = {
      pinchThreshold: { label: '捏合阈值', min: 0.15, max: 0.5 },
      horizontalMargin: { label: '水平裁边比例', min: 0, max: 0.35 },
      verticalMargin: { label: '垂直裁边比例', min: 0, max: 0.35 },
      verticalCenter: { label: '手部高度', min: 0.3, max: 0.8 },
      smoothing: { label: '手势光标平滑', min: 0, max: 0.9 },
    } as const
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      const label = document.createElement('label')
      const input = document.createElement('input')
      const output = document.createElement('output')
      input.id = 'hand-' + key
      input.type = 'range'
      input.min = String(fields[key].min)
      input.max = String(fields[key].max)
      input.step = '0.01'
      input.value = output.value = String(calibration[key])
      label.htmlFor = input.id
      output.htmlFor.add(input.id)
      label.append(fields[key].label, output, input)
      input.addEventListener('input', () => {
        calibration[key] = input.valueAsNumber
        output.value = input.value
      })
      element('hand-settings').append(label)
    }
  }

  get cameraDeviceId() {
    return this.handDevice.value || undefined
  }

  showCameraDevices(devices: CameraDevice[]) {
    const previous = this.handDevice.value
    const options = devices.map(device => new Option(device.label, device.id))
    if (previous && !devices.some(device => device.id === previous)) {
      options.push(new Option('所选设备已断开', previous))
    }
    this.handDevice.replaceChildren(new Option('系统默认', ''), ...options)
    this.handDevice.value = previous
  }

  selectCameraDevice(change: () => void) {
    this.handDevice.addEventListener('change', change)
  }

  setCameraMode(enabled: boolean, error = '') {
    this.cursor.classList.toggle('hand-cursor', enabled)
    this.cameraToggle.setAttribute('aria-pressed', String(enabled))
    const cameraAction = enabled ? '切回鼠标' : '启用摄像头'
    this.cameraToggle.setAttribute('aria-label', cameraAction)
    this.cameraToggle.title = error || cameraAction
    this.handReconnect.textContent = enabled ? '重新连接摄像头' : '连接摄像头'
    this.cameraStatus.hidden = !enabled && !error
    this.showHandStatus(error || (enabled ? handStatusText.permission : '摄像头未启动。'), !!error)
  }

  reportHandStatus(status: HandStatus) {
    this.showHandStatus(handStatusText[status], status === 'no-frames' || status === 'dark-frames' ||
      status === 'model-error' || status === 'inference-error')
  }

  private showHandStatus(message: string, error: boolean) {
    for (const status of [this.cameraStatus, this.handStatus]) {
      status.textContent = message
      status.classList.toggle('camera-error', error)
    }
  }

  showCameraPreview(video?: HTMLVideoElement) {
    const preview = element('hand-preview')
    preview.replaceChildren(...(video ? [video] : []))
    preview.hidden = !video
    video?.setAttribute('aria-label', '本地摄像头画面')
  }

  locate(position: Point, handAction?: 'aim' | 'activate') {
    const surface = this.surface.getBoundingClientRect()
    const field = this.playfield.getBoundingClientRect()
    const x = surface.left + position.x * surface.width
    const y = surface.top + position.y * surface.height
    const point = {
      x: (x - field.left) / field.width * arena.width,
      y: (y - field.top) / field.height * arena.height,
    }
    const hit = document.elementFromPoint(x, y)
    const target = hit?.closest<HTMLElement>('[data-channel], #draw, [data-hand]') ?? undefined
    let control = target?.matches(':disabled') ? undefined : target
    const inside = !!hit && this.playfield.contains(hit)
    const now = performance.now()
    if (handAction === 'aim' && control) this.lastButtonAim = { control, time: now }
    if (handAction === 'activate') {
      const aim = this.lastButtonAim
      this.lastButtonAim = undefined
      if (!control && aim && now - aim.time <= buttonGraceMs && !aim.control.matches(':disabled') && !aim.control.hidden) {
        const bounds = aim.control.getBoundingClientRect()
        const dx = Math.max(bounds.left - x, x - bounds.right, 0)
        const dy = Math.max(bounds.top - y, y - bounds.bottom, 0)
        if (Math.hypot(dx, dy) <= buttonGraceDistance) control = aim.control
      }
    }
    return { point, inside, control, screenY: y }
  }

  cancelCursor(point?: Point) {
    this.lastButtonAim = undefined
    this.showCursor(point)
  }

  showCursor(point?: Point, pressed = false, control?: HTMLElement) {
    if (this.hoveredControl !== control) {
      this.hoveredControl?.removeAttribute('data-gesture-hover')
      this.hoveredControl = control ?? undefined
      this.hoveredControl?.setAttribute('data-gesture-hover', '')
    }
    this.cursor.hidden = !point
    if (!point) {
      this.lastButtonAim = undefined
      return
    }
    if (this.souvenir.open) {
      const surface = this.surface.getBoundingClientRect()
      this.cursor.style.left = surface.left + point.x * surface.width + 'px'
      this.cursor.style.top = surface.top + point.y * surface.height + 'px'
    } else {
      this.cursor.style.left = point.x * 100 + '%'
      this.cursor.style.top = point.y * 100 + '%'
    }
    this.cursor.classList.toggle('pressed', pressed)
  }

  update(shaking: boolean, retained: readonly CapsuleResult[], notice: string, exporting: boolean) {
    this.channels.render()
    this.cabinet.toggleAttribute('data-shaking', shaking)
    this.gate.toggleAttribute('data-open', shaking)
    this.lever.button.disabled = shaking
    this.take.disabled = exporting || retained.length === 0
    if (this.notice.textContent !== notice) this.notice.textContent = notice
    if (retained.length === this.displayed.length && retained.every((item, i) => item === this.displayed[i])) return
    const columns = Math.max(1, Math.ceil(Math.sqrt(retained.length * 3.5)))
    this.retention.style.setProperty('--columns', String(columns))
    this.retention.style.setProperty('--rows', String(Math.max(1, Math.ceil(retained.length / columns))))
    const existing = new Map(this.displayed.map((item, i) => [item, this.retention.children[i]]))
    const arrivals: { element: HTMLElement; x: number }[] = []
    this.retention.replaceChildren(...retained.map(result => {
      const previous = existing.get(result)
      if (previous) return previous
      const { art, badge, name, exitX } = result
      const element = document.createElement('div')
      element.className = 'retained-token'
      element.append(emojiImage(art, 'retained-art', name))
      if (badge) element.append(emojiImage(badge, 'retained-badge'))
      arrivals.push({ element, x: exitX })
      return element
    }))
    this.displayed = [...retained]
    if (arrivals.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const floor = this.playfield.getBoundingClientRect()
      const offsets = arrivals.map(({ element, x }) => {
        const target = element.getBoundingClientRect()
        return { element, dx: floor.left + floor.width * x - target.x - target.width / 2,
          dy: floor.bottom - target.y - target.height / 2 }
      })
      for (const { element, dx, dy } of offsets) {
        element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
      }
    }
  }
}
