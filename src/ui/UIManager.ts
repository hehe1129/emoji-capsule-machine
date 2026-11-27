import { arena, cabinet, hatchInset, hatchThickness, settingsSchema, type LidSide, type Settings } from '../core/config'
import { CursorMotion } from '../input/CursorMotion'
import type { Point, PointerId } from '../input/InputManager'
import type { HandCalibration } from '../input/GestureFilter'
import type { HandStatus } from '../input/HandTracking'
import type { CameraDevice } from '../input/CameraCapture'
import { CapsuleLever } from './CapsuleLever'
import { ExhibitCamera } from './ExhibitCamera'
import { PosterEditor } from './PosterEditor'
import { printPoster } from './PosterPrinter'
import type { Poster } from '../capsule/PosterLayout'
import { fourDigits } from '../capsule/PosterStore'
import { place } from './placement'

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
  readonly lid = element<HTMLButtonElement>('lid')
  readonly cabinetArt = element('cabinet-art')
  readonly camera: ExhibitCamera
  readonly gallery = element('poster-viewport')
  private readonly enterMachine = element<HTMLButtonElement>('enter-machine')
  private readonly wallEdges = this.surface.querySelectorAll<HTMLButtonElement>('.wall-edge')
  private readonly instructions = element<HTMLDialogElement>('instructions')
  private readonly commands = element('machine-commands')
  private readonly cabinetFace = document.querySelector<SVGPathElement>('#cabinet-face')!
  private toastTimer?: number
  readonly take = element<HTMLButtonElement>('take')
  private readonly printSlot = element('print-slot')
  private readonly gate = element('retention-gate')
  private readonly souvenir = element<HTMLDialogElement>('souvenir')
  private readonly posterView = element('poster-view')
  readonly editor = new PosterEditor(this.posterView, element('poster-colors'), element('poster-templates'))
  private readonly likeButton = element<HTMLButtonElement>('poster-like')
  private liking?: { id: string; add: () => Promise<number> }
  private readonly confirm = element<HTMLButtonElement>('confirm-card')
  private readonly reroll = element<HTMLButtonElement>('reroll-card')
  private readonly pinCard = element<HTMLButtonElement>('pin-card')
  private readonly closeCard = element<HTMLButtonElement>('close-card')
  private readonly posterMessage = element('poster-message')
  private readonly download = element<HTMLAnchorElement>('save-card')
  readonly cursorMotion = new CursorMotion()
  private readonly paintedCursors = new Map<PointerId, Point>()
  private readonly cursors = new Map<PointerId, HTMLElement>([
    ['hand-0', element('cursor')], ['hand-1', element('cursor-secondary')],
  ])
  private readonly cameraToggle = element<HTMLButtonElement>('camera-toggle')
  private readonly cameraStatus = element('camera-status')
  private readonly handStatus = element('hand-status')
  private readonly handReconnect = element<HTMLButtonElement>('hand-reconnect')
  private readonly handDevice = element<HTMLSelectElement>('hand-device')
  private readonly notice = element('notice')
  private readonly hoveredControls = new Map<PointerId, HTMLElement>()
  private readonly lastButtonAim = new Map<PointerId, { control: HTMLElement; time: number }>()
  private cardUrl?: string
  private printing = false

  constructor(
    settings: Settings,
    onChange: () => void,
    onShake: () => void,
    onTake: () => void,
    onNavigate: () => void,
    onHelp: () => void,
    onSavePoster: () => void,
    onClosePoster: () => void,
    onPinPoster: () => void,
    onReroll: () => void,
    resizeRoom: (left: number, right: number, top: number) => void,
  ) {
    for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
      this.surface.addEventListener(type, event => {
        const target = event.target
        if (target instanceof Element && target.closest('#debug, input, textarea, [contenteditable="true"]')) return
        event.preventDefault()
      })
    }
    place(this.playfield, cabinet.chamber)
    place(element('collector'), cabinet.tray)
    this.cabinetArt.style.setProperty('--tray-left', cabinet.tray.x + 'px')
    this.cabinetArt.style.setProperty('--tray-width', cabinet.tray.width + 'px')
    this.cabinetArt.style.setProperty('--tray-height', cabinet.tray.height + 'px')
    this.cabinetArt.style.setProperty('--hatch-inset', hatchInset + 'px')
    this.cabinetArt.style.setProperty('--hatch-thickness', hatchThickness + 'px')
    this.camera = new ExhibitCamera(this.surface, element('world'), () => {
      if (this.camera.locked) onNavigate()
      this.updateView()
    }, resizeRoom)
    this.enterMachine.addEventListener('click', () => void this.camera.go('machine'))
    for (const edge of this.wallEdges) edge.addEventListener('click', () => void this.camera.go('overview'))
    this.surface.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.modalOpen && !this.printing && this.camera.view !== 'overview') {
        void this.camera.go('overview')
      }
    })
    this.createPosterRays()
    this.lever = new CapsuleLever(element<HTMLButtonElement>('draw'), onShake)
    this.take.addEventListener('click', onTake)
    this.closeCard.addEventListener('click', () => this.souvenir.close())
    this.confirm.addEventListener('click', onSavePoster)
    this.likeButton.addEventListener('click', () => {
      const current = this.liking
      if (!current) return
      void current.add().then(count => {
        if (this.liking === current) this.updateLike(current.id, count)
      }).catch(() => this.report('暂时无法点赞，请重试。'))
    })
    this.reroll.addEventListener('click', onReroll)
    this.pinCard.addEventListener('click', onPinPoster)
    this.souvenir.addEventListener('cancel', event => {
      if (this.closeCard.disabled) event.preventDefault()
    })
    this.souvenir.addEventListener('click', event => {
      if (event.target !== this.souvenir || this.download.hidden || this.closeCard.disabled) return
      const bounds = this.souvenir.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) this.souvenir.close()
    })
    element('help').addEventListener('click', () => {
      onNavigate()
      onHelp()
      this.open(this.instructions)
    })
    element('close-help').addEventListener('click', () => this.instructions.close())
    for (const dialog of [this.souvenir, this.instructions]) {
      dialog.addEventListener('close', () => {
        this.surface.append(...this.cursors.values())
        this.cancelCursor()
      })
    }
    this.souvenir.addEventListener('close', () => {
      this.editor.close()
      this.liking = undefined
      this.likeButton.hidden = true
      delete this.souvenir.dataset.freshPrint
      delete this.souvenir.dataset.reveal
      onClosePoster()
      if (this.cardUrl) URL.revokeObjectURL(this.cardUrl)
      this.cardUrl = undefined
      this.posterView.replaceChildren()
      this.download.removeAttribute('href')
    })
    this.updateView()
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
  }

  private updateView() {
    const { view, locked } = this.camera
    this.commands.inert = locked || view !== 'machine'
    this.gallery.inert = locked || view === 'machine'
    this.enterMachine.hidden = view !== 'overview' || locked
    for (const edge of this.wallEdges) edge.disabled = view !== 'wall' || locked
  }

  get modalOpen() {
    return this.souvenir.open || this.instructions.open
  }

  inputBounds() {
    return this.modalOpen ? new DOMRect(0, 0, innerWidth, innerHeight) : this.surface.getBoundingClientRect()
  }

  report(message: string, duration = 2900) {
    window.clearTimeout(this.toastTimer)
    this.notice.textContent = message
    this.notice.hidden = !message
    if (message && duration > 0) this.toastTimer = window.setTimeout(() => { this.notice.hidden = true }, duration)
  }

  showArchiveMode(mode: 'unknown' | 'local' | 'shared') {
    element('archive-mode').textContent = mode === 'local' ? '当前海报保存在这台设备。'
      : mode === 'shared' ? '' : '海报墙连接中。'
  }

  private open(dialog: HTMLDialogElement) {
    if (dialog.open) return
    dialog.showModal()
    dialog.append(...this.cursors.values())
    this.cancelCursor()
  }

  private createPosterRays() {
    const layer = element('poster-rays')
    const rays = [
      [12, 0, -121], [32, 0, -103], [64, 0, -80], [87, 0, -52],
      [100, 12, -29], [100, 34, -12], [100, 56, 8], [100, 79, 22], [100, 94, 42],
      [91, 100, 54], [63, 100, 82], [33, 100, 101], [7, 100, 133],
      [0, 84, 157], [0, 63, 173], [0, 40, 189], [0, 18, 207],
      [4, 0, -141], [24, 0, -116], [49, 0, -92], [74, 0, -64], [97, 0, -42],
      [100, 23, -22], [100, 45, 0], [100, 69, 14], [100, 88, 34],
      [82, 100, 66], [49, 100, 93], [20, 100, 117],
      [0, 93, 145], [0, 75, 165], [0, 53, 180], [0, 29, 197], [0, 6, 221],
    ]
    rays.forEach(([x, y, angle], index) => {
      const ray = document.createElement('i')
      ray.className = 'poster-ray'
      ray.style.left = x + '%'
      ray.style.top = y + '%'
      ray.style.setProperty('--ray-angle', angle + 'deg')
      ray.style.setProperty('--ray-duration', 2900 + (index * 137) % 1350 + 'ms')
      ray.style.setProperty('--ray-phase', -(index * 631 % 3750) + 'ms')
      layer.append(ray)
    })
  }

  showEditor(poster: Poster) {
    this.editor.open(poster)
    this.liking = undefined
    this.likeButton.hidden = true
    this.download.hidden = true
    this.pinCard.hidden = true
    this.confirm.hidden = false
    this.reroll.hidden = false
    this.souvenir.dataset.freshPrint = ''
    this.setPosterStatus(false)
    this.open(this.souvenir)
  }

  async print(poster: Poster) {
    const operator = this.surface.querySelector<HTMLElement>('.operator-controls')!
    this.printing = true
    operator.inert = true
    try {
      await printPoster(this.printSlot, poster, this.souvenir, () => {
        this.souvenir.dataset.reveal = ''
        this.souvenir.dataset.printFlight = ''
        this.showEditor(poster)
        this.closeCard.disabled = true
        return { view: this.posterView, rays: element('poster-rays') }
      })
    } finally {
      if (!this.souvenir.open) this.showEditor(poster)
      delete this.souvenir.dataset.printFlight
      this.closeCard.disabled = false
      this.printing = false
      operator.inert = false
    }
  }

  setPosterStatus(saving: boolean, message = '', posted = false) {
    this.editor.lock(saving)
    this.confirm.disabled = this.reroll.disabled = this.closeCard.disabled = saving
    this.confirm.textContent = saving ? '正在生成…' : '生成贴纸'
    this.pinCard.disabled = saving || posted
    this.pinCard.textContent = posted ? '已粘贴' : saving ? '粘贴中…' : '粘贴贴纸'
    this.posterMessage.textContent = message
    this.posterMessage.hidden = !message
  }

  updateLike(id: string, count: number) {
    if (this.liking?.id !== id) return
    this.likeButton.querySelector('[data-count]')!.textContent = fourDigits(count)
    this.likeButton.setAttribute('aria-label', '点赞，当前 ' + count + ' 次')
  }

  showCard(blob: Blob, canPin = false, likes?: { id: string; count: number; add: () => Promise<number> }) {
    this.liking = likes
    this.likeButton.hidden = !likes
    if (likes) this.updateLike(likes.id, likes.count)
    this.editor.close()
    this.setPosterStatus(false)
    this.confirm.hidden = true
    this.reroll.hidden = true
    this.pinCard.hidden = !canPin
    this.souvenir.toggleAttribute('data-fresh-print', canPin)
    if (this.cardUrl) URL.revokeObjectURL(this.cardUrl)
    this.cardUrl = URL.createObjectURL(blob)
    this.download.hidden = false
    this.download.href = this.cardUrl
    const image = new Image()
    image.draggable = false
    image.src = this.cardUrl
    image.alt = '扭蛋黄纪念海报'
    image.className = 'poster-preview-image'
    this.posterView.replaceChildren(image)
    this.open(this.souvenir)
  }

  setLid(side?: LidSide) {
    if (this.cabinetArt.dataset.lidSide === side) return
    this.lid.setAttribute('aria-pressed', String(!!side))
    if (side) this.cabinetArt.dataset.lidSide = side
    else delete this.cabinetArt.dataset.lidSide
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
    this.cameraToggle.setAttribute('aria-pressed', String(enabled))
    const cameraAction = enabled ? '切回鼠标' : '启用摄像头'
    this.cameraToggle.setAttribute('aria-label', cameraAction)
    this.cameraToggle.title = error || cameraAction
    this.handReconnect.textContent = enabled ? '重新连接摄像头' : '连接摄像头'
    this.cameraStatus.hidden = !enabled && !error
    this.showHandStatus(error || (enabled ? handStatusText.permission : '摄像头未启动。'), !!error)
    if (error) this.report(error, 5600)
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

  private onCabinetFace(x: number, y: number) {
    const transform = this.cabinetFace.getScreenCTM()
    return !!transform && this.cabinetFace.isPointInFill(new DOMPoint(x, y).matrixTransform(transform.inverse()))
  }

  locate(position: Point, handAction?: 'aim' | 'activate', pointer: PointerId = 'mouse') {
    const surface = this.inputBounds()
    const x = surface.left + position.x * surface.width
    const y = surface.top + position.y * surface.height
    const field = this.playfield.getBoundingClientRect()
    const point = {
      x: (x - field.left) / field.width * arena.width,
      y: (y - field.top) / field.height * arena.height,
    }
    const hit = document.elementFromPoint(x, y)
    const target = hit?.closest<HTMLElement>('#lid, #draw, [data-hand]') ?? undefined
    let control = target?.matches(':disabled') ? undefined : target
    const inside = !this.modalOpen && !this.camera.locked && this.camera.view !== 'wall' &&
      !!hit && this.surface.contains(hit) && !hit.closest('.operator-controls')
    const insideGallery = !this.modalOpen && !this.camera.locked && this.camera.view === 'wall' &&
      !!hit && this.gallery.contains(hit) && !hit.closest('[data-poster]')
    const machineBackdrop = inside && this.camera.view === 'machine' &&
      !hit.closest('#lid, #draw, #take, #playfield, #collector') && !this.onCabinetFace(x, y)
    const posterBackdrop = this.souvenir.open && !this.download.hidden && !this.closeCard.disabled && hit === this.souvenir &&
      (() => {
        const bounds = this.souvenir.getBoundingClientRect()
        return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom
      })()
    const now = performance.now()
    if (handAction === 'aim' && control) this.lastButtonAim.set(pointer, { control, time: now })
    if (handAction === 'activate') {
      const aim = this.lastButtonAim.get(pointer)
      this.lastButtonAim.delete(pointer)
      if (!control && aim && now - aim.time <= buttonGraceMs && !aim.control.matches(':disabled') && !aim.control.hidden && !aim.control.closest('[inert]')) {
        const bounds = aim.control.getBoundingClientRect()
        const dx = Math.max(bounds.left - x, x - bounds.right, 0)
        const dy = Math.max(bounds.top - y, y - bounds.bottom, 0)
        if (Math.hypot(dx, dy) <= buttonGraceDistance) control = aim.control
      }
    }
    const sticker = hit?.closest<HTMLElement>('[data-sticker], [data-label]') ?? undefined
    return { point, inside, control, screen: { x, y }, sticker, insideGallery, machineBackdrop, posterBackdrop }
  }

  cancelCursor(pointer?: PointerId, point?: Point) {
    for (const id of pointer ? [pointer] : this.cursors.keys()) {
      this.lastButtonAim.delete(id)
      this.cursorMotion.clear(id)
      this.paintedCursors.delete(id)
      this.showCursor(id, point)
    }
  }

  showCursor(pointer: PointerId, point?: Point, pressed = false, control?: HTMLElement, progress = 0) {
    const cursor = this.cursors.get(pointer)
    if (!cursor) return
    const previous = this.hoveredControls.get(pointer)
    if (previous !== control) {
      this.hoveredControls.delete(pointer)
      if (previous && ![...this.hoveredControls.values()].includes(previous)) previous.removeAttribute('data-gesture-hover')
      if (control) {
        this.hoveredControls.set(pointer, control)
        control.setAttribute('data-gesture-hover', '')
      }
    }
    cursor.hidden = !point
    if (!point) {
      this.lastButtonAim.delete(pointer)
      return
    }
    if (!this.cursorMotion.read(pointer, performance.now())) this.positionCursor(pointer, cursor, point)
    cursor.style.setProperty('--pinch-scale', String(1 - 0.56 * (pressed ? 1 : progress)))
    cursor.classList.toggle('pressed', pressed)
  }

  paintCursors(now: number) {
    for (const [pointer, cursor] of this.cursors) {
      if (cursor.hidden) continue
      const point = this.cursorMotion.read(pointer, now)
      if (point) this.positionCursor(pointer, cursor, point)
    }
  }

  paintedCursor(pointer: PointerId) {
    return this.cursors.get(pointer)?.hidden ? undefined : this.paintedCursors.get(pointer)
  }

  private positionCursor(pointer: PointerId, cursor: HTMLElement, point: Point) {
    this.paintedCursors.set(pointer, point)
    const width = this.modalOpen ? innerWidth : this.surface.clientWidth
    const height = this.modalOpen ? innerHeight : this.surface.clientHeight
    cursor.style.transform = `translate3d(${point.x * width}px, ${point.y * height}px, 0)`
  }

  update(shaking: boolean, retained: number, exporting: boolean, hatchOpen: boolean, hatchProgress: number) {
    this.cabinetArt.toggleAttribute('data-shaking', shaking)
    this.gate.toggleAttribute('data-open', hatchOpen)
    this.gate.style.setProperty('--gate-progress', String(hatchProgress))
    this.lever.button.disabled = shaking
    this.take.disabled = shaking || exporting || retained === 0
  }
}
