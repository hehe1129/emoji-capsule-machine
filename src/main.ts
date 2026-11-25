import { AppController } from './core/AppController'
import { dropInterval, initialSettings } from './core/config'
import { InputManager } from './input/InputManager'
import { MouseInput } from './input/MouseInput'
import { defaultHandCalibration } from './input/GestureFilter'
import { HandTracking } from './input/HandTracking'
import { browserCameraCapture } from './input/CameraCapture'
import { SceneRenderer } from './render/SceneRenderer'
import { UIManager } from './ui/UIManager'
import { PosterWall, posterElement } from './ui/PosterWall'
import { createPoster, type Poster } from './capsule/PosterLayout'
import type { CapsuleResult } from './capsule/CapsuleResult'
import { createSouvenir } from './capsule/SouvenirCard'
import './ui/styles.css'

async function start() {
  const app = new AppController({ ...initialSettings })
  const ui = new UIManager(app.settings, () => app.tune(), () => app.shake(performance.now()),
    take, cancelAction, () => ui.showArchiveMode(wall.store.mode))
  const scene = new SceneRenderer()
  const wall = new PosterWall(ui.gallery, async poster => {
    if (ui.camera.locked || ui.camera.view !== 'wall' || ui.modalOpen) return
    wall.aim()
    const preview = posterElement(poster)
    const version = poster.createdAt && 'version' in poster ? poster as Poster : undefined
    if (!version) ui.showCard(preview)
    else {
      try {
        const png = await createSouvenir(version)
        if (ui.camera.view === 'wall' && !ui.modalOpen) ui.showCard(preview, png)
      } catch {
        ui.report('海报暂时无法打开，请重试。')
      }
    }
  }, message => ui.report(message))
  let active: 'lid' | 'lever' | 'emoji' | undefined
  let nextDrop = 0
  let exporting = false
  let draft: { poster: Poster; items: CapsuleResult[]; png?: Blob } | undefined

  function refresh() {
    ui.update(app.shaking, app.retainedCount, exporting)
  }

  async function take() {
    if (exporting || ui.camera.locked || ui.camera.view !== 'machine') return
    if (!draft) {
      const items = app.capture()
      if (!items.length) return
      draft = { items, poster: createPoster(items) }
    }
    exporting = true
    refresh()
    const pending = draft
    try {
      pending.png ??= await createSouvenir(pending.poster)
      const saved = await wall.store.save(pending.poster)
      app.take(pending.items)
      draft = undefined
      wall.add(saved)
      cancelAction()
      if (ui.camera.view === 'machine' && !ui.modalOpen) {
        ui.showCard(posterElement(saved), pending.png)
      }
      if (wall.store.mode === 'local') ui.report('海报已保存在这台设备。')
    } catch (error) {
      console.error(error)
      ui.report('海报保存失败。Emoji 已保留，可再次点「带走!」。', 5000)
    } finally {
      exporting = false
      refresh()
    }
  }

  function setLid(open: boolean) {
    ui.setLid(open)
    nextDrop = open ? performance.now() : 0
  }

  function cancelAction() {
    setLid(false)
    ui.lever.cancel()
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
    const handAction = action.type === 'grab' ? 'activate' : action.pressed ? undefined : 'aim'
    const hit = ui.locate(action.position, cameraMode ? handAction : undefined)
    ui.showCursor(cameraMode ? action.position : undefined, action.pressed, cameraMode ? hit.control : undefined)
    wall.aim(!ui.modalOpen && hit.insideGallery && !action.pressed ? hit.screenY : undefined)
    if (ui.camera.locked) return
    if (action.type === 'grab') {
      if (hit.control === ui.lid) {
        active = 'lid'
        setLid(true)
      } else if (hit.control === ui.lever.button && ui.lever.start(hit.screenY)) {
        active = 'lever'
      } else if (cameraMode && hit.control) {
        hit.control.click()
      } else if (hit.inside) {
        app.grab(hit.point)
        active = 'emoji'
      }
    } else if (action.type === 'release') {
      if (active === 'lid') setLid(false)
      if (active === 'lever') { ui.lever.move(hit.screenY); ui.lever.release() }
      if (active === 'emoji') {
        if (!cameraMode) app.drag(hit.point)
        app.release(true)
      }
      active = undefined
    } else if (action.pressed) {
      if (active === 'lever') ui.lever.move(hit.screenY)
      if (active === 'emoji') app.drag(hit.point, cameraMode)
    }
  }, () => cameraMode ? calibration.smoothing : app.settings.smoothing)

  const mouse = new MouseInput(ui.surface)
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
      setLid(true)
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
    if (nextDrop && now >= nextDrop) {
      nextDrop = now + dropInterval
      if (app.drop()) capacityMessage = false
      else if (!capacityMessage) {
        capacityMessage = true
        ui.report(app.notice)
      }
    }
    app.tick(now, delta)
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
