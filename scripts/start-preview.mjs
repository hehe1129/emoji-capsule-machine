import { execFile } from 'node:child_process'

const host = '127.0.0.1'
const port = 5181
const url = 'http://' + host + ':' + port + '/'

function openPreview() {
  console.log('扭蛋黄 · ' + url)
  execFile('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true }, error => {
    if (error) console.error('Open this address manually: ' + url)
  })
}

async function isPreviewRunning() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.ok && (await response.text()).includes('id="machine"')
  } catch {
    return false
  }
}

try {
  if (await isPreviewRunning()) {
    openPreview()
  } else {
    const { createServer } = await import('vite')
    const server = await createServer({ server: { host, port, strictPort: true } })
    try {
      await server.listen()
    } catch (error) {
      await server.close()
      throw error
    }
    console.log('Keep this window open while using the preview.')
    openPreview()
  }
} catch (error) {
  console.error('Could not start the preview.', error.message)
  if (error.code === 'ERR_MODULE_NOT_FOUND') console.error('Install project dependencies with npm.cmd ci.')
  process.exitCode = 1
}
