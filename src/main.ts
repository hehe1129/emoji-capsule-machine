import { AppController } from './core/AppController'
import { initialSettings } from './core/config'
import { InputManager } from './input/InputManager'
import { MouseInput } from './input/MouseInput'
import { defaultHandCalibration } from './input/GestureFilter'
import { HandTracking } from './input/HandTracking'
import { browserCameraCapture } from './input/CameraCapture'
import { SceneRenderer } from './render/SceneRenderer'
import { UIManager, type Command } from './ui/UIManager'
import './ui/styles.css'

async function start() {
  const app = new AppController({ ...initialSettings })
  const ui = new UIManager(app.settings, () => app.tune(), command)
  const scene = new SceneRenderer()

  function refresh() {
    ui.update(app.count, app.settings.maxEmoji, app.result, app.notice)
  }

  function command(action: Command, lane: number) {
    if (action === 'draw') app.draw()
    else if (action === 'reset') app.reset()
    else app.drop(action, lane)
    refresh()
  }

  try {
    await scene.init(ui.playfield)
  } catch (error) {
    console.error(error)
    ui.error('渲染初始化失败，请重启浏览器或检查硬件加速。')
    return
  }

  let cameraMode = false
  const calibration = { ...defaultHandCalibration }
  const input = new InputManager((action) => {
    if (action.type === 'cancel') {
      app.release()
      ui.cancelCursor(action.position)
      return
    }
    const handAction = action.type === 'grab' ? 'activate' : action.pressed ? undefined : 'aim'
    const hit = ui.locate(action.position, cameraMode ? handAction : undefined)
    ui.showCursor(
      cameraMode || (hit.inside && !app.result) ? action.position : undefined,
      action.pressed,
      cameraMode ? hit.control : undefined,
    )
    if (action.type === 'grab') {
      if (hit.command) command(hit.command, hit.lane)
      else if (hit.inside) app.grab(hit.point)
    } else if (action.type === 'release') {
      if (!cameraMode) app.drag(hit.point)
      app.release(true)
    } else if (action.pressed) {
      app.drag(hit.point, cameraMode)
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
  let previous = performance.now()
  function frame(now: number) {
    input.update(now)
    app.tick(now - previous)
    previous = now
    scene.render(app.entities, app.heldId)
    refresh()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

void start().catch((error: unknown) => {
  console.error(error)
  const message = document.getElementById('empty-message')
  if (message) message.textContent = '扭蛋黄启动失败，请刷新页面。'
})
