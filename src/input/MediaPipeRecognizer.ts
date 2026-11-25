import { GestureRecognizer, type Landmark } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import type { HandObservation } from './GestureFilter'

const palmIndices = [0, 5, 9, 13, 17]

function distance(a: Landmark, b: Landmark, aspect = 1) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect)
}

export async function createHandRecognizer() {
  const recognizer = await GestureRecognizer.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
    baseOptions: {
      modelAssetPath: import.meta.env.BASE_URL + 'models/gesture_recognizer.task',
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.42,
    minHandPresenceConfidence: 0.42,
  })

  return {
    observe(video: HTMLVideoElement, now: number): HandObservation | undefined {
      const result = recognizer.recognizeForVideo(video, now)
      const hand = result.landmarks[0]
      if (!hand || hand.length < 21) return

      const position = { x: 0, y: 0 }
      for (const index of palmIndices) {
        position.x += hand[index].x / palmIndices.length
        position.y += hand[index].y / palmIndices.length
      }
      const thumb = hand[4]
      const index = hand[8]
      position.x = position.x * 0.22 + (thumb.x + index.x) * 0.39
      position.y = position.y * 0.22 + (thumb.y + index.y) * 0.39
      const points = result.worldLandmarks[0]
      const world = points?.length >= 21 ? points : undefined
      const landmarks = world ?? hand
      const aspect = world ? 1 : video.videoWidth / video.videoHeight
      const palmSize = Math.max(distance(landmarks[0], landmarks[9], aspect),
        distance(landmarks[5], landmarks[17], aspect))
      const pinchRatio = distance(landmarks[4], landmarks[8], aspect) / palmSize
      if (![position.x, position.y, pinchRatio].every(Number.isFinite)) return
      // Blend the fingertip midpoint with a small palm contribution to stabilize aim.
      return { position, pinchRatio }
    },
    close: () => recognizer.close(),
  }
}
