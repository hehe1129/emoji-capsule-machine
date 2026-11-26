import { createHandRecognizer } from './MediaPipeRecognizer'
import type { HandWorkerReply } from './HandInference'

const model = createHandRecognizer()
const reply = (message: HandWorkerReply) => self.postMessage(message)
void model.then(() => reply({ type: 'ready' }), error => reply({ type: 'error', message: String(error) }))

self.onmessage = async ({ data }: MessageEvent<{ frame: ImageBitmap; at: number }>) => {
  try {
    const recognizer = await model
    reply({ type: 'result', hands: recognizer.observe(data.frame, data.at) })
  } catch (error) {
    reply({ type: 'error', message: String(error) })
  } finally {
    data.frame.close()
  }
}
