/** Source-checkout updater for native Linux installations, shaped like the electron-updater surface the coordinator uses. */
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { inc, parse } from 'semver'
import { readDesktopLoginShellEnvironment, resolveDesktopLoginShellConfig } from '../login-shell-environment.ts'

const run = promisify(execFile)
const BRANCH = 'master'

interface Target {
  readonly root: string
  readonly sha: string
  readonly version: string
  readonly abort: AbortController
}

/**
 * Version label that semver-sorts above the installed version, so the coordinator's `gt` gate accepts it.
 * @param current - Installed semver version.
 * @param sha - Remote commit; prefixed so all-digit hashes stay valid identifiers.
 * @returns For example `0.2.2-rc.1.git.g1a2b3c4` or `0.2.3-git.g1a2b3c4` for a final release.
 */
export function linuxUpdateVersion(current: string, sha: string): string {
  const parsed = parse(current)
  if (parsed === null) throw new Error(`desktop update: installed version ${current} is not semver`)
  const id = `git.g${sha.slice(0, 7)}`
  return parsed.prerelease.length > 0 ? `${parsed.version}.${id}` : `${inc(parsed.version, 'patch') ?? ''}-${id}`
}

/** Fetches `master` from the checkout's GitHub remote, fast-forwards, rebuilds, then relaunches. */
export class LinuxGitUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  channel = 'nightly'
  allowDowngrade = false
  allowPrerelease = true
  private target: Target | undefined

  /**
   * @param appPath - Directory inside the git checkout.
   * @param currentVersion - Installed application version.
   */
  constructor(
    private readonly appPath: () => string = () => app.getAppPath(),
    private readonly currentVersion: () => string = () => app.getVersion(),
  ) { super() }

  async checkForUpdates(): Promise<{
    isUpdateAvailable: boolean
    updateInfo: { version: string }
    cancellationToken: { cancel: () => void }
  }> {
    const abort = new AbortController()
    const git = async (cwd: string, ...args: string[]): Promise<string> => (await run('git', ['-C', cwd, ...args], {
      signal: abort.signal, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })).stdout.trim()
    const root = await git(this.appPath(), 'rev-parse', '--show-toplevel')
    // Prefer the rizalrepo fork when a checkout also tracks the official repository as origin.
    const remotes = (await git(root, 'remote')).split('\n')
    const remote = remotes.includes('fork') ? 'fork' : 'origin'
    await git(root, 'fetch', '--quiet', remote, BRANCH)
    const sha = await git(root, 'rev-parse', 'FETCH_HEAD')
    const head = await git(root, 'rev-parse', 'HEAD')
    // Only a strict fast-forward is an update; local commits ahead of or diverged from master are not replaced.
    const ancestor = head !== sha && await git(root, 'merge-base', '--is-ancestor', 'HEAD', sha).then(() => true, () => false)
    const version = ancestor ? linuxUpdateVersion(this.currentVersion(), sha) : this.currentVersion()
    this.target = ancestor ? { root, sha, version, abort } : undefined
    return { isUpdateAvailable: ancestor, updateInfo: { version }, cancellationToken: { cancel: () => { abort.abort() } } }
  }

  async downloadUpdate(): Promise<string[]> {
    const target = this.target
    if (target === undefined) throw new Error('desktop update: no checked update is available')
    const { root, sha, version, abort } = target
    // Launchers from a desktop session may lack the shell PATH that provides pnpm.
    const { environment } = await readDesktopLoginShellEnvironment(
      process.env, resolveDesktopLoginShellConfig(process.env), { signal: abort.signal })
    const env = { ...environment, GIT_TERMINAL_PROMPT: '0' }
    const steps: readonly [string, readonly string[], string, number][] = [
      // --ff-only refuses to overwrite local edits or create merges; the error is reported instead.
      ['git', ['merge', '--ff-only', sha], root, 20],
      ['pnpm', ['install', '--config.confirmModulesPurge=false'], root, 45],
      ['pnpm', ['run', 'build:artifacts'], root, 65],
      ['pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', 'build'], root, 80],
      ['pnpm', ['run', 'prepare:primary-runtime'], join(root, 'apps', 'desktop'), 92],
      ['pnpm', ['run', 'prepare:dev-project'], join(root, 'apps', 'desktop'), 99],
    ]
    this.emit('download-progress', { percent: 1 })
    for (const [command, args, cwd, percent] of steps) {
      await run(command, args, { cwd, env, signal: abort.signal, maxBuffer: 256 * 1024 * 1024 })
      this.emit('download-progress', { percent })
    }
    this.target = undefined
    this.emit('update-downloaded', { version })
    return []
  }

  quitAndInstall(): void {
    app.relaunch()
    app.exit(0)
  }
}
