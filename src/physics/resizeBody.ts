import Matter from 'matter-js'

const { Body } = Matter

export function resizeBody(body: Matter.Body, x: number, y: number) {
  // Matter gives held bodies infinite density. Resize their dynamic shape before restoring the hold.
  const held = body.isStatic
  if (held) Body.setStatic(body, false)
  const angle = body.angle
  Body.setAngle(body, 0)
  Body.scale(body, x, y)
  Body.setAngle(body, angle)
  if (held) Body.setStatic(body, true)
}
