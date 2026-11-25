import { AppController } from './core/AppController'
import { dropInterval, initialSettings, type LidSide } from './core/config'
import { InputManager } from './input/InputManager'
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

async function start() {
  const app = new AppController({ ...initialSettings })
  const ui = new UIManager(app.settings, () => app.tune(), () => app.shake(performance.now()),
    () => void take(), cancelAction, () => ui.showArchiveMode(wall.store.mode), () => void generatePoster(),
    closePoster, () => void pinPoster(), rerollPoster)
  const scene = new SceneRenderer()
  const wall = new PosterWall(ui.gallery, async poster => {
    if (ui.camera.locked || ui.camera.view !== 'wall' || ui.modalOpen) return
    wall.aim()
    try {
      const png = await createSouvenir(poster)
      if (ui.camera.view === 'wall' && !ui.modalOpen) ui.showCard(png)
    } catch {
      ui.report('海报暂时无法打开，请重试。')
    }
  }, message => ui.report(message))
  let active: 'lid' | 'lever' | 'emoji' | 'sticker' | undefined
  let nextDrop = 0
  let lidSide: LidSide | undefined
  let exporting = false
  let printing = false
  let draft: { poster: Poster; items: CapsuleResult[]; variation: number; png?: Blob } | undefined

  function refresh() {
    ui.update(app.shaking, app.retainedCount, exporting || printing)
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
    draft = undefined
    refresh()
    if (active === 'sticker') active = undefined
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

  function cancelAction() {
    setLid()
    ui.lever.cancel()
    ui.editor.release()
    app.release()
    wall.aim()
    active = undefined
    ui.cancelCursor()
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
    if (action.type === 'cancel') {
      cancelAction()
      if (cameraMode) ui.cancelCursor(action.position)
      return
    }
    if (printing) return
    const handAction = action.type === 'grab' ? 'activate' : action.pressed ? undefined : 'aim'
    const hit = ui.locate(action.position, cameraMode ? handAction : undefined)
    ui.showCursor(cameraMode ? action.position : undefined, action.pressed, cameraMode ? hit.control : undefined)
    wall.aim(!ui.modalOpen && hit.insideGallery && !action.pressed ? hit.screen.y : undefined)
    if (ui.camera.locked) return
    if (action.type === 'grab') {
      if (hit.sticker && ui.editor.grab(hit.sticker, hit.screen)) {
        active = 'sticker'
      } else if (hit.control === ui.lid) {
        active = 'lid'
        const bounds = ui.lid.getBoundingClientRect()
        setLid(hit.screen.x < bounds.left + bounds.width / 2 ? 'left' : 'right')
      } else if (hit.control === ui.lever.button && ui.lever.start(hit.screen.y)) {
        active = 'lever'
      } else if (cameraMode && hit.control) {
        hit.control.click()
      } else if (hit.inside) {
        app.grab(hit.point, ui.camera.view === 'overview')
        active = 'emoji'
      }
    } else if (action.type === 'release') {
      if (active === 'lid') setLid()
      if (active === 'lever') { ui.lever.move(hit.screen.y); ui.lever.release() }
      if (active === 'sticker') {
        if (!cameraMode) ui.editor.drag(hit.screen)
        ui.editor.release()
      }
      if (active === 'emoji') {
        if (!cameraMode) app.drag(hit.point)
        app.release(true)
      }
      active = undefined
    } else if (action.pressed) {
      if (active === 'lever') ui.lever.move(hit.screen.y)
      if (active === 'sticker') ui.editor.drag(hit.screen)
      if (active === 'emoji') app.drag(hit.point, cameraMode)
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
    cameraMode = useCamera
    ui.setCameraMode(useCamera, error)
    input.use(useCamera ? hand : mouse)
  }

  ui.lid.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (!event.repeat && !active) {
      active = 'lid'
      setLid('left')
    }
  })
  ui.lid.addEventListener('keyup', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (active === 'lid') cancelAction()
  })
  ui.lid.addEventListener('blur', () => {
    if (active === 'lid' && !cameraMode) cancelAction()
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
    scene.render(app.entities, app.heldId)
    refresh()
    if (ui.camera.view === 'wall' && !ui.camera.locked && !ui.modalOpen) wall.tick(delta)
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
