import type { HandObservation } from './GestureFilter'

export type HandWorkerReply = { type: 'ready' } | { type: 'result'; hands: HandObservation[] } |
  { type: 'error'; message: string }

type Inference = {
  observe: (video: HTMLVideoElement, at: number) => Promise<HandObservation[]>
  close: () => void
}

async function onMainThread(): Promise<Inference> {
  const { createHandRecognizer } = await import('./MediaPipeRecognizer')
  const model = await createHandRecognizer()
  return { observe: async (video, at) => model.observe(video, at), close: model.close }
}

export async function createHandInference(signal: AbortSignal): Promise<Inference> {
  // MediaPipe's WASM loader is a classic script. Vite bundles the classic worker for preview and deployment.
  if (import.meta.env.DEV || typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
    return onMainThread()
  }
  let worker: Worker | undefined
  let pending: { resolve: (hands: HandObservation[]) => void; reject: (error: Error) => void } | undefined
  let closed = false
  let fallback: Inference | undefined
  const close = () => {
    closed = true
    worker?.terminate()
    pending?.reject(new Error('Hand tracking closed'))
    pending = undefined
    fallback?.close()
  }
  try {
    const background = worker = new Worker(new URL('./hand-worker.ts', import.meta.url))
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => finish(new Error('Hand tracker startup timed out')), 12000)
      const abort = () => finish(new Error('Hand tracking closed'))
      const finish = (error?: Error) => {
        window.clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (error) reject(error)
        else resolve()
      }
      if (signal.aborted) return abort()
      signal.addEventListener('abort', abort, { once: true })
      background.onerror = event => finish(new Error(event.message))
      background.onmessage = ({ data }: MessageEvent<HandWorkerReply>) => {
        if (data.type === 'ready') finish()
        if (data.type === 'error') finish(new Error(data.message))
      }
    })
    let failed = false
    const fail = (error: Error) => {
      failed = true
      background.terminate()
      pending?.reject(error)
      pending = undefined
    }
    background.onerror = event => fail(new Error(event.message))
    background.onmessage = ({ data }: MessageEvent<HandWorkerReply>) => {
      if (data.type === 'error') fail(new Error(data.message))
      if (data.type === 'result') {
        pending?.resolve(data.hands)
        pending = undefined
      }
    }
    return {
      close,
      async observe(video, at) {
        if (failed) {
          fallback ??= await onMainThread()
          if (closed) { fallback.close(); return [] }
          return fallback.observe(video, at)
        }
        const ratio = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight)
        try {
          const frame = await createImageBitmap(video, {
            resizeWidth: Math.round(video.videoWidth * ratio),
            resizeHeight: Math.round(video.videoHeight * ratio),
          })
          if (closed) { frame.close(); return [] }
          return await new Promise<HandObservation[]>((resolve, reject) => {
            pending = { resolve, reject }
            try { background.postMessage({ frame, at }, [frame]) }
            catch (error) { frame.close(); fail(new Error(String(error))) }
          })
        } catch (error) {
          if (closed) return []
          if (!failed) fail(new Error(String(error)))
          return []
        }
      },
    }
  } catch (error) {
    worker?.terminate()
    if (signal.aborted) throw error
    return onMainThread()
  }
}
