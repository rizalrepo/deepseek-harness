/** Materialize the development project and desktop-runtime.json without launching Electron. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import type { DesktopRelease } from '../src/release.ts'
import { resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { prepareDevelopmentProject } from './development-project.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '../..')
const DEVELOPMENT_ROOT = join(APP_ROOT, '.desktop-build', 'development')

function packageVersion(path: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { readonly version?: string }
  if (typeof manifest.version !== 'string') throw new Error(`prepare-dev-project: missing version in ${path}`)
  return manifest.version
}

const version = packageVersion(join(APP_ROOT, 'package.json'))
const pnpmVersion = packageVersion(join(APP_ROOT, 'node_modules', 'pnpm', 'package.json'))
const release: DesktopRelease = {
  schemaVersion: 1,
  version,
  hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
  nodeVersion: execFileSync(createRequire(import.meta.url)('electron') as string, ['-p', 'process.versions.node'],
    { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).trim(),
  pnpmVersion,
}

prepareDevelopmentProject({
  projectDir: join(DEVELOPMENT_ROOT, 'project'),
  cliDir: join(REPOSITORY_ROOT, 'apps', 'cli'),
  hostDir: join(REPOSITORY_ROOT, 'apps', 'desktop-host'),
  dependencyDir: join(REPOSITORY_ROOT, 'node_modules', '.pnpm', 'node_modules'),
  release,
  target: resolveDesktopBuildTarget(),
})
console.log('desktop development project prepared successfully')
