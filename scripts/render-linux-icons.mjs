import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const require = createRequire(import.meta.url)
const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const sharp = require(path.join(REPO_ROOT, 'apps/desktop/node_modules/sharp'))
const iconSvgPath = path.join(REPO_ROOT, 'apps/desktop/resources/icon.svg')

if (!fs.existsSync(iconSvgPath)) {
  console.error('icon.svg not found at', iconSvgPath)
  process.exit(1)
}

const lines = fs.readFileSync(iconSvgPath, 'utf8').split('\n')
const newLines = lines.filter((_, i) => ![1, 2, 3, 4, 8].includes(i))
const blueSvg = newLines.join('\n')
  .replace('stop-color="#1C2434"', 'stop-color="#4D6BFE"')
  .replace('stop-color="#0F1115"', 'stop-color="#1D4ED8"')

const svgBuffer = Buffer.from(blueSvg, 'utf8')
const userHome = os.homedir()
const sizes = [16, 24, 32, 48, 64, 128, 256, 512]

// 1. Scalable SVG
const scalableDir = path.join(userHome, '.local/share/icons/hicolor/scalable/apps')
fs.mkdirSync(scalableDir, { recursive: true })
fs.writeFileSync(path.join(scalableDir, 'deepseek-harness.svg'), svgBuffer)

// 2. PNG sizes
for (const size of sizes) {
  const dir = path.join(userHome, `.local/share/icons/hicolor/${size}x${size}/apps`)
  fs.mkdirSync(dir, { recursive: true })
  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(dir, 'deepseek-harness.png'))
}

// 3. Electron resource icon
const desktopIcon = path.join(REPO_ROOT, 'apps/desktop/resources/icon.png')
await sharp(svgBuffer)
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(desktopIcon)

console.log('Linux transparent icons rendered successfully.')
