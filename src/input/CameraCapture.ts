export interface CameraDevice {
  id: string
  label: string
}

export interface CameraCapture {
  open(deviceId?: string): Promise<MediaStream>
}

export const browserCameraCapture = {
  open(deviceId?: string) {
    const media = navigator.mediaDevices
    if (!media?.getUserMedia) {
      throw new DOMException('Camera is unavailable in this context', 'SecurityError')
    }
    return media.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 60 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    })
  },

  async list(): Promise<CameraDevice[]> {
    const devices = await navigator.mediaDevices?.enumerateDevices()
    if (!devices) return []
    return devices
      .filter(device => device.kind === 'videoinput' && device.deviceId)
      .map((device, index) => ({ id: device.deviceId, label: device.label || '摄像头 ' + (index + 1) }))
  },
} satisfies CameraCapture & { list(): Promise<CameraDevice[]> }
