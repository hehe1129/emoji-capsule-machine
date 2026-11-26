import { GestureFilter, type HandCalibration } from './GestureFilter'
import { handPointers, type InputSample, type InputSource } from './InputManager'
import { associateHands, type SeenHand } from './HandAssociation'
import { createHandInference } from './HandInference'
import type { CameraCapture } from './CameraCapture'

type PoseStatus = 'seeking' | 'hover' | 'open' | 'pinch'
export type HandStatus = PoseStatus | 'permission' | 'starting' | 'loading' | 'no-frames' | 'dark-frames' | 'model-error' | 'inference-error'

const frameTimeoutMs = 1500
const inferenceIntervalMs = 14
const brightnessCheckMs = 400

function readBrightness(context: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const { width, height } = context.canvas
  context.drawImage(video, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 14) return false
  }
  return true
}

function cameraError(error: unknown, selectedDevice?: string) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return '摄像头权限未开放。请在浏览器中允许访问后重试。'
    if (selectedDevice && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) {
      return '所选摄像头不可用，请检查连接或选择系统默认摄像头。'
    }
    if (error.name === 'NotFoundError') return '未找到可用摄像头。'
    if (error.name === 'NotReadableError' || error.name === 'AbortError') return '摄像头无法读取，可能正被其他应用占用。'
    if (error.name === 'OverconstrainedError') return '摄像头不支持当前的画面设置。'
  }
  return '无法启动摄像头。'
}

export class HandTracking implements InputSource {
  constructor(
    private readonly capture: CameraCapture,
    private readonly selectedDevice: () => string | undefined,
    private readonly calibration: () => HandCalibration,
    private readonly onStatus: (status: HandStatus) => void,
    private readonly onError: (message: string, error?: unknown) => void,
    private readonly onPreview: (video?: HTMLVideoElement) => void,
  ) {}

  connect(emit: (sample: InputSample) => void) {
    const tracks = handPointers.map(pointer => ({
      pointer, filter: new GestureFilter(), seen: undefined as SeenHand | undefined, pose: 'seeking' as PoseStatus,
    }))
    const events = new AbortController()
    const video = document.createElement('video')
    video.defaultMuted = true
    video.muted = true
    video.playsInline = true
    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = 12
    sampleCanvas.height = 8
    let brightnessContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
    let lastBrightnessCheck = -Infinity
    let darkSince: number | undefined
    let stream: MediaStream | undefined
    let track: MediaStreamTrack | undefined
    let recognizer: Awaited<ReturnType<typeof createHandInference>> | undefined
    let frame = 0
    let videoFrame = 0
    let presentedFrames = 0
    const hasVideoFrames = typeof video.requestVideoFrameCallback === 'function'
    const markVideoFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (events.signal.aborted) return
      presentedFrames = metadata.presentedFrames
      videoFrame = video.requestVideoFrameCallback(markVideoFrame)
    }
    let lastVideoTime = -1
    let lastFrameAt = 0
    let lastInference = -Infinity
    let inferencePending = false
    let generation = 0
    let modelState: 'idle' | 'loading' | 'ready' | 'model-error' | 'inference-error' = 'idle'
    let status: HandStatus | undefined
    let blurred = false
    const stopped = () => events.signal.aborted

    const report = (next: HandStatus) => {
      if (status === next) return
      status = next
      this.onStatus(next)
    }

    const publish = (hand: typeof tracks[number], sample?: InputSample) => {
      if (!sample) return
      emit({ ...sample, pointer: hand.pointer })
      hand.pose = sample.gesture === 'lost' ? 'seeking' : sample.gesture
    }

    const reset = () => {
      generation++
      for (const hand of tracks) {
        hand.seen = undefined
        publish(hand, hand.filter.reset())
      }
    }

    const closeRecognizer = () => {
      const current = recognizer
      recognizer = undefined
      try {
        current?.close()
      } catch (error) {
        console.warn('Could not close the hand recognizer:', error)
      }
    }

    const stop = () => {
      if (stopped()) return
      events.abort()
      cancelAnimationFrame(frame)
      if (hasVideoFrames) video.cancelVideoFrameCallback(videoFrame)
      reset()
      video.pause()
      video.srcObject = null
      this.onPreview()
      stream?.getTracks().forEach(track => track.stop())
      closeRecognizer()
    }

    const fail = (message: string, error?: unknown) => {
      stop()
      this.onError(message, error)
    }

    function checkBrightness(now: number) {
      if (!brightnessContext || now - lastBrightnessCheck < brightnessCheckMs) return
      lastBrightnessCheck = now
      try {
        if (readBrightness(brightnessContext, video)) darkSince ??= now
        else darkSince = undefined
      } catch {
        brightnessContext = null
        darkSince = undefined
      }
    }

    async function loadModel() {
      modelState = 'loading'
      try {
        recognizer = await createHandInference(events.signal)
        if (stopped()) {
          closeRecognizer()
          return
        }
        modelState = 'ready'
      } catch (error) {
        if (stopped()) return
        console.warn('Could not load the hand recognizer:', error)
        modelState = 'model-error'
      }
    }

    const inspect = (now: number) => {
      if (stopped() || !track) return
      if (track.readyState === 'ended') {
        cameraDisconnected()
        return
      }
      if (!document.hidden && !blurred) {
        for (const hand of tracks) publish(hand, hand.filter.expire(now))
        const videoTime = hasVideoFrames ? presentedFrames : video.currentTime
        const freshFrame = !track.muted && !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 && video.videoHeight > 0 && videoTime !== lastVideoTime
        if (freshFrame) {
          if (now - lastFrameAt >= frameTimeoutMs) darkSince = undefined
          lastVideoTime = videoTime
          lastFrameAt = now
          checkBrightness(now)
          if (modelState === 'idle') void loadModel()
          if (recognizer && !inferencePending && now - lastInference >= inferenceIntervalMs) {
            lastInference = now
            inferencePending = true
            const requestGeneration = generation
            void recognizer.observe(video, now).then(observed => {
              if (stopped() || generation !== requestGeneration) return
              const sampledAt = performance.now()
              const observations = associateHands(observed, tracks.map(hand => hand.seen), sampledAt)
              const calibration = this.calibration()
              for (const [index, hand] of tracks.entries()) {
                const observation = observations[index]
                if (observation) hand.seen = { ...observation, side: observation.side ?? hand.seen?.side, at: sampledAt }
                publish(hand, hand.filter.observe(observation, sampledAt, calibration))
              }
            }).catch(error => {
              if (stopped()) return
              console.warn('Hand recognition stopped:', error)
              reset()
              closeRecognizer()
              modelState = 'inference-error'
            }).finally(() => { inferencePending = false })
          }
        }
        if (now - lastFrameAt >= frameTimeoutMs) report('no-frames')
        else if (darkSince !== undefined && now - darkSince >= frameTimeoutMs) report('dark-frames')
        else if (modelState === 'idle') report('starting')
        else report(modelState === 'ready'
          ? (['pinch', 'open', 'hover', 'seeking'] as const).find(pose => tracks.some(hand => hand.pose === pose)) ?? 'seeking'
          : modelState)
      }
      frame = requestAnimationFrame(inspect)
    }

    function cameraDisconnected() {
      fail('摄像头画面已断开。请确认设备仍连接并关闭其他占用摄像头的应用，再重试。')
    }

    async function playVideo() {
      try {
        await video.play()
      } catch (error) {
        if (!stopped()) fail('已连接摄像头，但浏览器无法播放画面。请重新开启摄像头。', error)
      }
    }

    const start = async () => {
      report('permission')
      const deviceId = this.selectedDevice()
      try {
        if (!window.isSecureContext) {
          fail('请通过本机 127.0.0.1、localhost 或 HTTPS 打开页面以使用摄像头。')
          return
        }
        const opened = await this.capture.open(deviceId)
        if (stopped()) {
          opened.getTracks().forEach(track => track.stop())
          return
        }
        stream = opened
        track = stream.getVideoTracks()[0]
        if (!track || track.readyState === 'ended') {
          fail('摄像头连接后立即断开。请关闭其他占用摄像头的应用，再重试。')
          return
        }
        const options = { signal: events.signal }
        track.addEventListener('ended', cameraDisconnected, options)
        track.addEventListener('unmute', () => {
          if (!document.hidden && video.paused) void playVideo()
        }, options)
        video.addEventListener('error', () => {
          fail('浏览器无法读取摄像头画面。请重新开启摄像头。', video.error)
        }, options)
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            reset()
          } else {
            lastFrameAt = performance.now()
            darkSince = undefined
            if (video.paused) void playVideo()
          }
        }, options)
        video.srcObject = stream
        this.onPreview(video)
        report('starting')
        lastFrameAt = performance.now()
        if (hasVideoFrames) videoFrame = video.requestVideoFrameCallback(markVideoFrame)
        frame = requestAnimationFrame(inspect)
        void playVideo()
      } catch (error) {
        if (!stopped()) fail(cameraError(error, deviceId), error)
        return
      }
    }

    const options = { signal: events.signal }
    window.addEventListener('pagehide', stop, options)
    window.addEventListener('blur', () => {
      blurred = true
      reset()
    }, options)
    window.addEventListener('focus', () => {
      blurred = false
      lastFrameAt = performance.now()
    }, options)
    // Defer startup so the manager owns the disconnect callback before errors can switch modes.
    queueMicrotask(() => {
      if (!stopped()) void start()
    })
    return stop
  }
}
