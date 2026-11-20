import { GestureRecognizer, type Landmark } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import type { HandObservation } from './GestureFilter'

const palmIndices = [0, 5, 9, 13, 17]
const fingers = [5, 9, 13, 17]

function difference(a: Landmark, b: Landmark) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function length(vector: ReturnType<typeof difference>) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function isPalmExtended(hand?: Landmark[]) {
  if (!hand || hand.length < 21) return false
  return fingers.every(base => {
    const proximal = difference(hand[base + 1], hand[base])
    const distal = difference(hand[base + 3], hand[base + 1])
    const dot = proximal.x * distal.x + proximal.y * distal.y + proximal.z * distal.z
    const wristToTip = length(difference(hand[base + 3], hand[0]))
    const wristToJoint = length(difference(hand[base + 1], hand[0]))
    return dot > 0.75 * length(proximal) * length(distal) && wristToTip > 1.18 * wristToJoint
  })
}

function countCurledFingers(hand?: Landmark[]) {
  if (!hand || hand.length < 21) return 0
  return fingers.filter(base => {
    const proximal = difference(hand[base + 1], hand[base])
    const middle = difference(hand[base + 2], hand[base + 1])
    const dot = proximal.x * middle.x + proximal.y * middle.y + proximal.z * middle.z
    const tipDistance = length(difference(hand[base + 3], hand[base]))
    const straightLength = length(proximal) + length(middle) + length(difference(hand[base + 3], hand[base + 2]))
    return dot < 0.45 * length(proximal) * length(middle) && tipDistance < 0.82 * straightLength
  }).length
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
      const category = result.gestures[0]?.[0]
      if (!hand) return

      const position = { x: 0, y: 0 }
      for (const index of palmIndices) {
        const landmark = hand[index]
        if (!Number.isFinite(landmark?.x) || !Number.isFinite(landmark?.y)) return
        position.x += landmark.x / palmIndices.length
        position.y += landmark.y / palmIndices.length
      }
      const gesture = category?.categoryName === 'Open_Palm' ? 'open'
        : category?.categoryName === 'Closed_Fist' ? 'fist' : undefined
      const worldHand = result.worldLandmarks[0]
      return {
        position,
        gesture,
        confidence: category?.score,
        extendedPalm: gesture !== 'fist' && isPalmExtended(worldHand),
        curledFingers: countCurledFingers(worldHand),
      }
    },
    close: () => recognizer.close(),
  }
}
