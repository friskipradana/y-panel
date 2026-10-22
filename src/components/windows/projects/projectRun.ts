import type { ProjectRun, ProjectRunInput, ProjectService } from '@/api/projects'

// How a project runs, as the form holds it: the variables are one text of KEY=VALUE lines

export interface RunForm {
  installCommand: string
  buildCommand: string
  startCommand: string
  envText: string
  services: ProjectService[]
}

export const EMPTY_RUN: RunForm = { installCommand: '', buildCommand: '', startCommand: '', envText: '', services: [] }

export const EMPTY_SERVICE: ProjectService = { name: '', kind: 'process', installCommand: '', buildCommand: '', startCommand: '', dir: '', serve: '', path: '/', port: 0 }

export const MAX_SERVICES = 6

// A runtime fills the three commands with what it usually takes. The build step runs only when package.json has a build script,
// so a project without one is not stopped by it.
const IF_BUILD = `if grep -q '"build"' package.json; then`

export const RUNTIME_PRESETS = {
  npm: { installCommand: 'npm install --no-audit --no-fund', buildCommand: 'npm run build --if-present', startCommand: 'npm start' },
  bun: { installCommand: 'bun install', buildCommand: `${IF_BUILD} bun run build; fi`, startCommand: 'bun run start' },
  pnpm: { installCommand: 'pnpm install', buildCommand: 'pnpm run build --if-present', startCommand: 'pnpm start' },
  yarn: { installCommand: 'yarn install', buildCommand: `${IF_BUILD} yarn build; fi`, startCommand: 'yarn start' },
} as const

export type RuntimePreset = keyof typeof RUNTIME_PRESETS

export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const at = line.indexOf('=')
    if (at <= 0) continue
    env[line.slice(0, at).trim()] = line.slice(at + 1)
  }
  return env
}

export const envToText = (env: Record<string, string> | undefined) =>
  Object.keys(env ?? {})
    .sort()
    .map((key) => `${key}=${(env ?? {})[key]}`)
    .join('\n')

export const runFromProject = (run: ProjectRun | undefined): RunForm => ({
  installCommand: run?.installCommand ?? '',
  buildCommand: run?.buildCommand ?? '',
  startCommand: run?.startCommand ?? '',
  envText: envToText(run?.env),
  services: (run?.services ?? []).map((service) => ({ ...EMPTY_SERVICE, ...service })),
})

// What is sent: for a project of several processes the commands are on the processes, for any other type the processes are none
export function runPayload(projectType: string, run: RunForm): ProjectRunInput {
  const stack = projectType === 'stack'
  return {
    installCommand: stack || projectType === 'static' ? '' : run.installCommand.trim(),
    buildCommand: stack || projectType === 'static' ? '' : run.buildCommand.trim(),
    startCommand: stack || projectType === 'static' ? '' : run.startCommand.trim(),
    env: parseEnv(run.envText),
    services: stack ? run.services : [],
  }
}

// Which runtime a set of commands came from, so the preset box shows it
export function presetOf(commands: { installCommand: string; buildCommand: string; startCommand: string }): RuntimePreset | '' {
  for (const key of Object.keys(RUNTIME_PRESETS) as RuntimePreset[]) {
    const preset = RUNTIME_PRESETS[key]
    if (preset.installCommand === commands.installCommand && preset.buildCommand === commands.buildCommand && preset.startCommand === commands.startCommand) return key
  }
  return ''
}
