import { arena, settingsSchema, type Settings } from '../core/config'
import { catalog, emojiKinds } from '../emoji/catalog'
import type { CapsuleResult } from '../capsule/CapsuleResult'
import type { Point } from '../input/InputManager'
import type { HandCalibration } from '../input/GestureFilter'
import type { HandStatus } from '../input/HandTracking'
import type { CameraDevice } from '../input/CameraCapture'

const initialNotice = '按住拖动，松手释放。试试让不同的 Emoji 相撞。'
const buttonGraceMs = 220
const buttonGraceDistance = 28
const handNotice = '移动手掌控制光标，张手后握拳抓取或选择。'
const handStatusText: Record<HandStatus, string> = {
  permission: '等待摄像头权限…',
  starting: '摄像头已连接，正在等待第一帧画面…',
  loading: '正在加载本地手势模型…',
  'no-frames': '摄像头已连接，但没有新画面。请检查调试预览，或切回鼠标后重新启用摄像头。',
  'dark-frames': '摄像头正在传送几乎全黑的画面。请检查镜头是否遮住、摄像头隐私开关和室内光线。',
  'model-error': '已收到摄像头画面，手势模型加载失败。请刷新页面后重试。',
  'inference-error': '已收到摄像头画面，手势识别已中断。请重新连接摄像头。',
  seeking: '画面已连接，等待手掌入镜。',
  hover: '已定位手掌 · 伸直手指后再握拳',
  open: '已识别张手 · 移动光标',
  fist: '已识别握拳 · 张手释放',
}

function element<T extends HTMLElement>(id: string) {
  const node = document.getElementById(id)
  if (!node) throw new Error('页面缺少必要元素 ' + id)
  return node as T
}

export type Command = 'draw' | 'reset' | (typeof emojiKinds)[number]

export class UIManager {
  readonly surface = element('machine')
  readonly playfield = element('playfield')
  private readonly palette = element('palette')
  private readonly draw = element<HTMLButtonElement>('draw')
  private readonly reset = element<HTMLButtonElement>('reset')
  private readonly cursor = element('cursor')
  private readonly cameraToggle = element<HTMLButtonElement>('camera-toggle')
  private readonly cameraStatus = element('camera-status')
  private readonly handStatus = element('hand-status')
  private readonly handReconnect = element<HTMLButtonElement>('hand-reconnect')
  private readonly handDevice = element<HTMLSelectElement>('hand-device')
  private readonly result = element('result')
  private readonly notice = element('notice')
  private readonly countLabel = element('count')
  private readonly empty = element('empty')
  private readonly buttons: HTMLButtonElement[] = []
  private previousResult?: CapsuleResult
  private handMode = false
  private hoveredControl?: HTMLButtonElement
  private lastButtonAim?: { control: HTMLButtonElement; time: number }

  constructor(
    settings: Settings,
    onChange: () => void,
    onCommand: (command: Command, lane: number) => void,
  ) {
    emojiKinds.forEach((kind, index) => {
      const item = catalog[kind]
      const button = document.createElement('button')
      const glyph = document.createElement('span')
      glyph.className = 'emoji-glyph'
      glyph.setAttribute('aria-hidden', 'true')
      glyph.textContent = item.glyph
      button.type = 'button'
      button.className = 'emoji-button'
      button.dataset.action = kind
      button.setAttribute('aria-label', '投放' + item.name)
      button.append(glyph, item.name)
      this.palette.append(button)
      this.buttons.push(button)
      button.disabled = true
      button.addEventListener('click', (event) => {
        if (event.detail === 0) onCommand(kind, index / (emojiKinds.length - 1))
      })
    })
    this.draw.addEventListener('click', (event) => {
      if (event.detail === 0) onCommand('draw', 0)
    })
    this.reset.addEventListener('click', (event) => {
      if (event.detail === 0) onCommand('reset', 0)
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
    element('empty-message').textContent = '从上方投放 Emoji'
    this.draw.disabled = false
    this.cameraToggle.disabled = false
    this.handReconnect.disabled = false
    for (const button of this.buttons) button.disabled = false
  }

  error(message: string) {
    element('empty-message').textContent = message
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
      confidence: { label: '手势置信度', min: 0.4, max: 0.95 },
      horizontalMargin: { label: '水平裁边比例', min: 0, max: 0.35 },
      verticalMargin: { label: '垂直裁边比例', min: 0, max: 0.35 },
      verticalCenter: { label: '手部高度（数值越大，手可放得越低）', min: 0.3, max: 0.8 },
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
    this.handMode = enabled
    this.cursor.classList.toggle('hand-cursor', enabled)
    this.cameraToggle.setAttribute('aria-pressed', String(enabled))
    this.cameraToggle.textContent = enabled ? '切回鼠标' : '启用摄像头'
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
    const hitButton = hit?.closest<HTMLButtonElement>('button[data-action]')
    let control = hitButton?.disabled ? undefined : hitButton ?? undefined
    const inside = !!hit && this.playfield.contains(hit)
    const now = performance.now()
    if (handAction === 'aim' && control) this.lastButtonAim = { control, time: now }
    if (handAction === 'activate') {
      const aim = this.lastButtonAim
      this.lastButtonAim = undefined
      if (!control && aim && now - aim.time <= buttonGraceMs && !aim.control.disabled && !aim.control.hidden) {
        const bounds = aim.control.getBoundingClientRect()
        const dx = Math.max(bounds.left - x, x - bounds.right, 0)
        const dy = Math.max(bounds.top - y, y - bounds.bottom, 0)
        if (Math.hypot(dx, dy) <= buttonGraceDistance) control = aim.control
      }
    }
    const command = control?.dataset.action as Command | undefined
    const lane = control ? this.buttons.indexOf(control) / (emojiKinds.length - 1) : 0
    return { point, command, lane, inside, control }
  }

  showCursor(point?: Point, pressed = false, control?: HTMLButtonElement | null) {
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
    this.cursor.style.left = point.x * 100 + '%'
    this.cursor.style.top = point.y * 100 + '%'
    this.cursor.classList.toggle('pressed', pressed)
  }

  update(count: number, max: number, result: CapsuleResult | undefined, notice: string) {
    const countText = count + ' / ' + max
    if (this.countLabel.textContent !== countText) this.countLabel.textContent = countText
    this.empty.hidden = count > 0
    const message = notice || (this.handMode ? handNotice : initialNotice)
    if (this.notice.textContent !== message) this.notice.textContent = message
    if (result === this.previousResult) return
    this.previousResult = result
    for (const button of this.buttons) button.disabled = !!result
    this.draw.hidden = !!result
    this.reset.hidden = !result
    this.notice.hidden = !!result
    this.result.hidden = !result
    if (result) {
      element('result-glyph').textContent = result.glyph
      element('result-name').textContent = result.name
      element('result-source').textContent = result.source ? '来自 ' + result.source : ''
      this.reset.focus({ preventScroll: true })
    } else {
      this.draw.focus({ preventScroll: true })
    }
  }
}
