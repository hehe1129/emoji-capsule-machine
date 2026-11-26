import { AppController } from './core/AppController'
import { dropInterval, initialSettings, type LidSide } from './core/config'
import { InputManager, type PointerId } from './input/InputManager'
import { MouseInput } from './input/MouseInput'
import { defaultHandCalibration } from './input/GestureFilter'
import { HandTracking } from './input/HandTracking'
import { browserCameraCapture } from './input/CameraCapture'
import { SceneRenderer } from './render/SceneRenderer'
import { UIManager } from './ui/UIManager'
import { PosterWall } from './ui/PosterWall'
import { createPoster, type Poster } from './capsule/PosterLayout'
import type { CapsuleResult } from './capsule/CapsuleResult'
import { createSouvenir } from './capsule/SouvenirCard'
import './ui/styles.css'

type Interaction = 'lid' | 'lever' | 'emoji' | 'sticker' | 'wall' | 'exit'

async function start() {
  const app = new AppController({ ...initialSettings })
  const ui = new UIManager(app.settings, () => app.tune(), () => app.shake(performance.now()),
    () => void take(), cancelAction, () => ui.showArchiveMode(wall.store.mode), () => void generatePoster(),
    closePoster, () => void pinPoster(), rerollPoster, (left, right, top) => app.resizeRoom(left, right, top))
  const scene = new SceneRenderer()
  const examples: CapsuleResult['kind'][][] = [
    ['chick', 'heart'], ['moon', 'cat', 'fish'], ['lightning', 'turtle', 'angry'], ['sun', 'chick'],
  ]
  const samples = import.meta.env.DEV && new URLSearchParams(location.search).has('layout-preview')
    ? examples.map((kinds, index) => ({
      ...createPoster(kinds.map((kind, entityId) => ({ kind, entityId }))),
      palette: [0, 5, 2, 3][index],
    }))
    : []
  const wall = new PosterWall(ui.gallery, ui.surface, async (poster, tile) => {
    if (ui.camera.locked || ui.modalOpen) return
    if (ui.camera.view === 'overview') {
      await ui.camera.go('wall', tile)
      return
    }
    if (ui.camera.view !== 'wall') return
    try {
      const png = await createSouvenir(poster)
      if (ui.camera.view === 'wall' && !ui.modalOpen) ui.showCard(png)
    } catch {
      ui.report('海报暂时无法打开，请重试。')
    }
  }, message => ui.report(message), samples)
  const actions = new Map<PointerId, Interaction>()
  const using = (action: Interaction) => [...actions.values()].includes(action)
  let nextDrop = 0
  let lidSide: LidSide | undefined
  let exporting = false
  let printing = false
  let draft: { poster: Poster; items: CapsuleResult[]; variation: number; png?: Blob } | undefined

  function refresh() {
    ui.update(app.shaking, app.retainedCount, exporting || printing, app.hatchOpen, app.hatchProgress)
  }

  async function take() {
    if (printing || exporting || ui.camera.locked || ui.modalOpen || ui.camera.view !== 'machine') return
    const items = app.capture()
    if (!items.length) return
    const poster = createPoster(items)
    draft = { items, poster, variation: 0 }
    printing = true
    cancelAction()
    refresh()
    try {
      await ui.print(poster)
    } catch (error) {
      console.error(error)
    } finally {
      printing = false
      ui.showEditor(poster)
      refresh()
    }
  }

  function rerollPoster() {
    if (!draft || draft.png || exporting || printing) return
    draft.variation++
    draft.poster = createPoster(draft.items, draft.variation, draft.poster)
    ui.showEditor(draft.poster)
  }

  function closePoster() {
    if (draft?.png) app.take(draft.items)
    app.releasePosterSelection()
    draft = undefined
    refresh()
    for (const [pointer, action] of actions) if (action === 'sticker') actions.delete(pointer)
  }

  async function generatePoster() {
    const pending = draft
    if (!pending || exporting) return
    exporting = true
    refresh()
    ui.setPosterStatus(true)
    try {
      pending.png = await createSouvenir(pending.poster)
      ui.showCard(pending.png, true)
    } catch (error) {
      console.error(error)
      ui.setPosterStatus(false, '生成失败，Emoji 已保留。')
    } finally {
      exporting = false
      refresh()
    }
  }

  async function pinPoster() {
    const pending = draft
    if (!pending?.png || exporting) return
    exporting = true
    refresh()
    ui.setPosterStatus(true)
    try {
      const saved = await wall.store.save(pending.poster)
      app.take(pending.items)
      draft = undefined
      wall.add(saved)
      ui.setPosterStatus(false, wall.store.mode === 'local' ? '已贴到这台设备的海报墙。' : '已贴到海报墙。', true)
    } catch (error) {
      console.error(error)
      ui.setPosterStatus(false, '粘贴失败，Emoji 已保留。')
    } finally {
      exporting = false
      refresh()
    }
  }

  function setLid(side?: LidSide) {
    lidSide = side
    app.setFeedLid(side)
    nextDrop = side ? performance.now() + 125 : 0
  }

  function cancelAction(pointer?: PointerId) {
    for (const id of pointer ? [pointer] : actions.keys()) {
      const action = actions.get(id)
      if (action === 'lid') setLid()
      if (action === 'lever') ui.lever.cancel()
      if (action === 'sticker') ui.editor.release(id)
      if (action === 'emoji') app.release(false, id)
      if (action === 'wall') wall.stopPan()
      actions.delete(id)
    }
    ui.cancelCursor(pointer)
  }

  try {
    await scene.init(ui.cabinetArt)
  } catch (error) {
    console.error(error)
    ui.report('渲染初始化失败，请检查浏览器硬件加速。', 0)
    return
  }

  let cameraMode = false
  const calibration = { ...defaultHandCalibration }
  const input = new InputManager(action => {
    const { pointer } = action
    if (action.type === 'cancel') {
      cancelAction(pointer)
      if (cameraMode) ui.cancelCursor(pointer, action.position)
      return
    }
    if (printing) return
    const handAction = action.type === 'grab' ? 'activate' : action.pressed ? undefined : 'aim'
    const hit = ui.locate(action.position, cameraMode ? handAction : undefined, pointer)
    ui.showCursor(pointer, cameraMode ? action.position : undefined, action.pressed, cameraMode ? hit.control : undefined,
      action.pinchProgress)
    if (ui.camera.locked) return
    if (action.type === 'grab') {
      const allowAssist = cameraMode && (!hit.control || ui.editor.hasSelection)
      if (ui.editor.grab(hit.sticker, hit.screen, pointer, allowAssist)) {
        actions.set(pointer, 'sticker')
      } else if (hit.control === ui.lid) {
        if (using('lid')) return
        actions.set(pointer, 'lid')
        const bounds = ui.lid.getBoundingClientRect()
        setLid(hit.screen.x < bounds.left + bounds.width / 2 ? 'left' : 'right')
      } else if (hit.control === ui.lever.button && ui.lever.start(hit.screen.y)) {
        actions.set(pointer, 'lever')
      } else if (cameraMode && hit.control) {
        hit.control.click()
      } else if (hit.insideGallery) {
        if (using('wall')) return
        actions.set(pointer, 'wall')
        wall.startPan(hit.screen)
      } else if (hit.inside && app.grab(hit.point, ui.camera.view === 'overview', ui.camera.view === 'machine', pointer)) {
        actions.set(pointer, 'emoji')
      } else if (hit.machineBackdrop || (cameraMode && hit.posterBackdrop)) {
        actions.set(pointer, 'exit')
      }
    } else if (action.type === 'release') {
      const active = actions.get(pointer)
      if (active === 'lid') setLid()
      if (active === 'lever') { ui.lever.move(hit.screen.y); ui.lever.release() }
      if (active === 'sticker') {
        if (!cameraMode) ui.editor.drag(hit.screen, pointer)
        ui.editor.release(pointer)
      }
      if (active === 'emoji') {
        if (!cameraMode) app.drag(hit.point, false, pointer)
        app.release(true, pointer)
      }
      if (active === 'wall') wall.stopPan()
      if (active === 'exit') {
        if (hit.posterBackdrop) document.querySelector<HTMLDialogElement>('#souvenir')?.close()
        if (hit.machineBackdrop) void ui.camera.go('overview')
      }
      actions.delete(pointer)
    } else if (action.pressed) {
      const active = actions.get(pointer)
      if (active === 'lever') ui.lever.move(hit.screen.y)
      if (active === 'sticker') ui.editor.drag(hit.screen, pointer)
      if (active === 'emoji') app.drag(hit.point, cameraMode, pointer)
      if (active === 'wall') wall.movePan(hit.screen)
    }
  }, () => cameraMode ? calibration.smoothing : app.settings.smoothing)

  const mouse = new MouseInput(ui.surface, () => ui.inputBounds())
  let deviceQuery = 0
  async function refreshCameraDevices() {
    const request = ++deviceQuery
    try {
      const devices = await browserCameraCapture.list()
      if (request === deviceQuery) ui.showCameraDevices(devices)
    } catch (error) {
      console.warn('Could not list cameras:', error)
    }
  }

  const hand = new HandTracking(
    browserCameraCapture,
    () => ui.cameraDeviceId,
    () => calibration,
    status => ui.reportHandStatus(status),
    (message, error) => {
      if (error) console.warn('Camera input:', error)
      switchInput(false, message + ' 已切回鼠标。')
    },
    video => {
      ui.showCameraPreview(video)
      if (video) void refreshCameraDevices()
    },
  )
  function switchInput(useCamera: boolean, error?: string) {
    cancelAction()
    cameraMode = useCamera
    ui.setCameraMode(useCamera, error)
    input.use(useCamera ? hand : mouse)
  }

  ui.lid.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (!event.repeat && !actions.has('mouse') && !using('lid')) {
      actions.set('mouse', 'lid')
      setLid('left')
    }
  })
  ui.lid.addEventListener('keyup', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (actions.get('mouse') === 'lid') cancelAction('mouse')
  })
  ui.lid.addEventListener('blur', () => {
    if (actions.get('mouse') === 'lid' && !cameraMode) cancelAction('mouse')
  })
  ui.bindCamera(calibration, () => switchInput(!cameraMode), () => switchInput(true))
  ui.selectCameraDevice(() => {
    if (cameraMode) switchInput(true)
  })
  navigator.mediaDevices?.addEventListener('devicechange', refreshCameraDevices)
  void refreshCameraDevices()
  window.addEventListener('pageshow', event => {
    if (event.persisted && cameraMode) switchInput(false, '离开页面后摄像头已关闭，可以重新启用。')
  })
  switchInput(false)
  ui.ready()
  void wall.refresh()
  let lastWallSync = performance.now()
  let previous = performance.now()
  let capacityMessage = false
  function frame(now: number) {
    const delta = now - previous
    input.update(now)
    if (lidSide && lidSide === app.lidSide && nextDrop && now >= nextDrop) {
      nextDrop = now + dropInterval
      if (app.drop(lidSide)) capacityMessage = false
      else if (!capacityMessage) {
        capacityMessage = true
        ui.report(app.notice)
      }
    }
    app.tick(now, delta)
    ui.setLid(app.lidSide)
    scene.render(app.entities, app.heldIds, app.water)
    refresh()
    if (now - lastWallSync >= 15000) {
      lastWallSync = now
      void wall.refresh()
    }
    previous = now
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

void start().catch((error: unknown) => {
  console.error(error)
  const message = document.getElementById('notice')
  if (message) {
    message.textContent = '扭蛋黄启动失败，请刷新页面。'
    message.hidden = false
  }
})
