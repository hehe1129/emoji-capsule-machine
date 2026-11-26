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
    numHands: 2,
    minHandDetectionConfidence: 0.42,
    minHandPresenceConfidence: 0.42,
    minTrackingConfidence: 0.45,
  })

  return {
    observe(frame: HTMLVideoElement | ImageBitmap, now: number): HandObservation[] {
      const result = recognizer.recognizeForVideo(frame, now)
      return result.landmarks.flatMap((hand, handIndex): HandObservation[] => {
        if (hand.length < 21) return []

        // Blend the fingertip midpoint with a small palm contribution to stabilize aim.
        const position = { x: 0, y: 0 }
        for (const index of palmIndices) {
          position.x += hand[index].x / palmIndices.length
          position.y += hand[index].y / palmIndices.length
        }
        const palm = { ...position }
        const thumb = hand[4]
        const index = hand[8]
        position.x = position.x * 0.22 + (thumb.x + index.x) * 0.39
        position.y = position.y * 0.22 + (thumb.y + index.y) * 0.39
        const aspect = frame instanceof ImageBitmap ? frame.width / frame.height : frame.videoWidth / frame.videoHeight
        const projected = (a: number, b: number) => Math.hypot((hand[a].x - hand[b].x) * aspect, hand[a].y - hand[b].y)
        const palmSize = Math.max(projected(0, 9), projected(5, 17))
        const screenRatio = projected(4, 8) / palmSize
        const world = result.worldLandmarks[handIndex]
        const worldRatio = world?.length >= 21
          ? distance(world[4], world[8]) / Math.max(distance(world[0], world[9]), distance(world[5], world[17]))
          : screenRatio
        // The fingertip projection is steadier than the model's inferred depth at contact.
        const pinchRatio = screenRatio * 0.78 + Math.min(worldRatio, screenRatio + 0.2) * 0.22
        if (![position.x, position.y, pinchRatio].every(Number.isFinite)) return []
        const handedness = result.handedness[handIndex]?.[0]
        return [{ position, palm, pinchRatio, side: handedness?.score > 0.60 ? handedness.categoryName : undefined }]
      })
    },
    close: () => recognizer.close(),
  }
}
