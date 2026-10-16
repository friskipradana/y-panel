#!/usr/bin/env bun
// declaude: remove Claude/AI attribution from a GitHub repository and make GitHub's cached
// Contributors list notice.
//
// What it does, in order (same concept as github.com/ediiloupatty/declaude, written for this repo):
//   1. preflight    git and gh present, gh signed in, write access to the repository
//   2. source       a fresh clone of the remote (default) or this working copy (--local)
//   3. scan         every branch and tag for attribution trailers
//   4. backup       a restorable git bundle before anything is rewritten
//   5. clean        rewrite messages only: code and commit authorship stay as they are
//   6. verify       the rewritten refs hold no attribution
//   7. push         force-push cleaned branches and tags (never the backup tags)
//   8. refresh      rename the default branch away and back, add one empty commit through the
//                   API, then poll the contributors list until the account is gone
//
// Usage:  bun run declaude OWNER/REPO [--local] [--dry-run] [-y] [--no-refresh] [--no-backup]
//                                     [--remote NAME] [--pattern REGEX]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

const c = {
  b: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
}

// Trailers and footers added by AI tooling. Matching is per line, case-insensitive.
const DEFAULT_PATTERN = String.raw`^\s*Co-Authored-By:.*(claude|anthropic)|Generated with .*Claude Code|^\s*🤖 Generated with`

interface Options {
  target: string
  local: boolean
  dryRun: boolean
  yes: boolean
  refresh: boolean
  backup: boolean
  remote: string
  pattern: string
}

function parseArgs(argv: string[]): Options {
  const o: Options = { target: '', local: false, dryRun: false, yes: false, refresh: true, backup: true, remote: '', pattern: DEFAULT_PATTERN }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--local') o.local = true
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '-y' || a === '--yes') o.yes = true
    else if (a === '--no-refresh') o.refresh = false
    else if (a === '--no-backup') o.backup = false
    else if (a === '--remote') o.remote = argv[++i] ?? ''
    else if (a === '--pattern') o.pattern = argv[++i] ?? DEFAULT_PATTERN
    else if (a === '-h' || a === '--help') usage(0)
    else if (!a.startsWith('-') && !o.target) o.target = a
    else usage(1, `unknown argument: ${a}`)
  }
  if (!o.target) usage(1, 'missing OWNER/REPO')
  return o
}

function usage(code: number, error?: string): never {
  if (error) console.error(c.red(error))
  console.log(`Usage: bun run declaude OWNER/REPO [options]

  --local        use this working copy instead of a fresh clone (push its branches, then refresh)
  --dry-run      scan and show the plan, change nothing
  -y, --yes      skip the confirmation prompt
  --no-refresh   skip the rename/commit that refreshes GitHub's Contributors list
  --no-backup    skip the restorable bundle (not recommended)
  --remote NAME  remote to push to in --local mode (default: the one pointing at OWNER/REPO)
  --pattern RX   lines to remove (default: Co-Authored-By Claude/Anthropic and "Generated with Claude Code")`)
  process.exit(code)
}

function run(cmd: string, args: string[], opts: { cwd?: string; allowFail?: boolean; input?: string } = {}): string {
  const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', input: opts.input, maxBuffer: 256 * 1024 * 1024 })
  if (r.error) {
    if (opts.allowFail) return ''
    throw new Error(`${cmd} could not start: ${r.error.message}`)
  }
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(' ')}\n${(r.stderr || r.stdout).trim()}`)
  }
  return (r.stdout ?? '').trim()
}

const git = (cwd: string, args: string[], allowFail = false) => run('git', args, { cwd, allowFail })
const gh = (args: string[], allowFail = false) => run('gh', args, { allowFail })

function step(n: number, title: string) {
  console.log(`\n${c.b(`${n}. ${title}`)}`)
}

async function confirm(question: string, expected: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`${question} Type ${c.b(expected)} to continue: `)
    return answer.trim() === expected
  } finally {
    rl.close()
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── scanning ─────────────────────────────────────────────────────────────────

interface Finding {
  sha: string
  subject: string
  line: string
}

function scan(repo: string, rx: RegExp): Finding[] {
  // %x1e separates records, %x1f separates sha / subject / body; all refs, including tags
  // branches and tags only; the local backup tags hold the old history on purpose
  const out = git(repo, ['log', '--branches', '--exclude=refs/tags/backup/*', '--tags', '--format=%H%x1f%s%x1f%B%x1e'])
  const found: Finding[] = []
  for (const record of out.split('\x1e')) {
    const [sha, subject, body] = record.trim().split('\x1f')
    if (!sha || body === undefined) continue
    for (const line of body.split('\n')) {
      if (rx.test(line)) {
        found.push({ sha: sha.slice(0, 10), subject: subject ?? '', line: line.trim() })
        break
      }
    }
  }
  return found
}

function authorWarnings(repo: string): string[] {
  const out = git(repo, ['log', '--branches', '--exclude=refs/tags/backup/*', '--tags', '--format=%an <%ae>%n%cn <%ce>'])
  return [...new Set(out.split('\n').filter((l) => /claude|anthropic/i.test(l)))]
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const o = parseArgs(process.argv.slice(2))
  const slug = o.target.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) usage(1, `not an OWNER/REPO: ${o.target}`)
  const rx = new RegExp(o.pattern, 'i')

  step(1, 'Preflight')
  for (const [cmd, args] of [['git', ['--version']], ['gh', ['--version']]] as const) {
    if (!run(cmd, [...args], { allowFail: true })) {
      console.error(c.red(`${cmd} is required and was not found on PATH.`))
      process.exit(1)
    }
  }
  if (spawnSync('gh', ['auth', 'status']).status !== 0) {
    console.error(c.red('gh is not signed in. Run: gh auth login'))
    process.exit(1)
  }
  const info = JSON.parse(gh(['repo', 'view', slug, '--json', 'defaultBranchRef,viewerPermission,isFork,url'])) as {
    defaultBranchRef: { name: string }
    viewerPermission: string
    url: string
  }
  const defaultBranch = info.defaultBranchRef.name
  if (!['ADMIN', 'MAINTAIN', 'WRITE'].includes(info.viewerPermission)) {
    console.error(c.red(`You only have ${info.viewerPermission} access to ${slug}; write access is required.`))
    process.exit(1)
  }
  console.log(`${c.green('ok')}  ${slug}  default branch: ${c.b(defaultBranch)}  access: ${info.viewerPermission}`)

  step(2, o.local ? 'Source: this working copy' : 'Source: fresh clone')
  let repo = process.cwd()
  let tmp = ''
  let remote = o.remote
  if (o.local) {
    if (!git(repo, ['rev-parse', '--git-dir'], true)) {
      console.error(c.red('--local must be run inside a git working copy.'))
      process.exit(1)
    }
    if (!remote) {
      const remotes = git(repo, ['remote', '-v']).split('\n')
      const hit = remotes.find((l) => l.includes(`github.com/${slug}`) && l.endsWith('(push)')) ?? remotes.find((l) => l.toLowerCase().includes(slug.toLowerCase()))
      remote = hit?.split(/\s+/)[0] ?? ''
    }
    if (!remote) {
      console.error(c.red(`No remote points at ${slug}; pass --remote NAME.`))
      process.exit(1)
    }
    console.log(`remote: ${c.b(remote)}`)
  } else {
    tmp = mkdtempSync(join(tmpdir(), 'declaude-'))
    repo = join(tmp, 'repo')
    console.log(c.dim(`cloning into ${repo}`))
    gh(['repo', 'clone', slug, repo, '--', '--no-single-branch'])
    remote = 'origin'
    // every remote branch becomes a local branch so the rewrite covers all of them
    for (const ref of git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/']).split('\n')) {
      const name = ref.replace(/^origin\//, '')
      if (name && name !== 'HEAD') git(repo, ['branch', '--track', name, ref], true)
    }
  }

  step(3, 'Scan branches and tags')
  const before = scan(repo, rx)
  const authors = authorWarnings(repo)
  console.log(before.length === 0 ? c.green('no attribution found in any ref') : c.yellow(`${before.length} commit(s) carry attribution:`))
  for (const f of before.slice(0, 8)) console.log(`  ${c.dim(f.sha)}  ${f.subject.slice(0, 60)}  ${c.dim('← ' + f.line.slice(0, 60))}`)
  if (before.length > 8) console.log(c.dim(`  … and ${before.length - 8} more`))
  for (const a of authors) console.log(c.yellow(`author/committer identity "${a}" is not changed (use git filter-repo --mailmap for that)`))

  const tags = git(repo, ['tag', '--list']).split('\n').filter((t) => t && !t.startsWith('backup/'))
  const branches = git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']).split('\n').filter(Boolean)
  console.log(`\nrefs to push: ${branches.length} branch(es), ${tags.length} tag(s)`)
  console.log(c.dim('plan: backup → rewrite messages → verify → force-push → ' + (o.refresh ? 'refresh contributors' : 'no refresh')))
  if (o.dryRun) {
    console.log(c.yellow('\n--dry-run: nothing was changed.'))
    cleanup(tmp)
    return
  }
  if (!o.yes && !(await confirm(`This force-pushes ${branches.length} branch(es) and ${tags.length} tag(s) of ${c.b(slug)}.`, slug))) {
    console.log('Aborted.')
    cleanup(tmp)
    process.exit(1)
  }

  if (o.backup) {
    step(4, 'Backup bundle')
    const dir = join(homedir(), '.declaude-backups')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${slug.replace('/', '-')}-${new Date().toISOString().replace(/[:.]/g, '-')}.bundle`)
    git(repo, ['bundle', 'create', file, '--all'])
    console.log(`${c.green('ok')}  ${file}`)
    console.log(c.dim(`restore: git -C <repo> fetch "${file}" "*:*"`))
  }

  if (before.length > 0) {
    step(5, 'Rewrite commit messages')
    if (git(repo, ['status', '--porcelain'], true)) {
      console.error(c.red('The working copy has uncommitted changes; commit or stash them first.'))
      process.exit(1)
    }
    const filter = `grep -viE ${shellQuote(o.pattern)} | cat -s`
    const env = { ...process.env, FILTER_BRANCH_SQUELCH_WARNING: '1' }
    const r = spawnSync('git', ['filter-branch', '-f', '--msg-filter', filter, '--tag-name-filter', 'cat', '--', '--branches', '--exclude=refs/tags/backup/*', '--tags'], { cwd: repo, env, encoding: 'utf8' })
    if (r.status !== 0) {
      console.error(c.red(`git filter-branch failed:\n${r.stderr}`))
      process.exit(1)
    }
    // filter-branch keeps the old refs under refs/original: remove them so nothing old is pushed
    for (const ref of git(repo, ['for-each-ref', '--format=%(refname)', 'refs/original/']).split('\n').filter(Boolean)) git(repo, ['update-ref', '-d', ref])
    console.log(c.green('ok'))
  } else {
    step(5, 'Rewrite commit messages')
    console.log(c.dim('nothing to rewrite'))
  }

  step(6, 'Verify')
  const after = scan(repo, rx)
  if (after.length > 0) {
    console.error(c.red(`${after.length} commit(s) still carry attribution; not pushing.`))
    process.exit(1)
  }
  console.log(c.green('0 commits with attribution in any local ref'))

  step(7, 'Force-push')
  const pushRes = spawnSync('git', ['push', '--force', remote, ...branches.map((b) => `refs/heads/${b}:refs/heads/${b}`), ...tags.map((t) => `refs/tags/${t}:refs/tags/${t}`)], { cwd: repo, encoding: 'utf8' })
  if (pushRes.status !== 0) {
    console.error(c.red(`push failed (branch protection or tag rules?):\n${pushRes.stderr}`))
    process.exit(1)
  }
  console.log(c.green('ok'))

  if (o.refresh) {
    step(8, "Refresh GitHub's Contributors list")
    await refreshContributors(slug, defaultBranch)
  }

  console.log(`\n${c.green('Done.')} Collaborators must run:  git fetch --all --prune --tags --force  and reset their branches to the remote.`)
  cleanup(tmp)
}

function cleanup(tmp: string) {
  if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

async function contributorLogins(slug: string): Promise<string[]> {
  const out = gh(['api', `repos/${slug}/contributors?per_page=100`, '--paginate', '--jq', '.[].login'], true)
  return out.split('\n').filter(Boolean)
}

const hasClaude = (logins: string[]) => logins.some((l) => /claude|anthropic/i.test(l))

async function refreshContributors(slug: string, defaultBranch: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(c.dim(`attempt ${attempt}/3`))
    // the flush: the default branch goes away and comes back, which resets GitHub's cached graph
    const temp = `declaude-tmp-${Date.now().toString(36)}`
    const renamed = gh(['api', '-X', 'POST', `repos/${slug}/branches/${defaultBranch}/rename`, '-f', `new_name=${temp}`], true)
    if (renamed) {
      gh(['api', '-X', 'POST', `repos/${slug}/branches/${temp}/rename`, '-f', `new_name=${defaultBranch}`])
      console.log('  default branch renamed away and back')
    } else {
      console.log(c.yellow('  could not rename the default branch (protection rule?); continuing with the commit only'))
    }

    // one empty commit, created through the API so no working copy is touched
    const head = gh(['api', `repos/${slug}/git/ref/heads/${defaultBranch}`, '--jq', '.object.sha'])
    const tree = gh(['api', `repos/${slug}/git/commits/${head}`, '--jq', '.tree.sha'])
    const created = gh(['api', '-X', 'POST', `repos/${slug}/git/commits`, '-f', 'message=chore: refresh GitHub contributors', '-f', `tree=${tree}`, '-f', `parents[]=${head}`, '--jq', '.sha'])
    gh(['api', '-X', 'PATCH', `repos/${slug}/git/refs/heads/${defaultBranch}`, '-f', `sha=${created}`])
    console.log(`  empty commit ${created.slice(0, 10)} on ${defaultBranch}`)

    // GitHub recomputes in the background: poll for a while
    for (let i = 0; i < 12; i++) {
      await sleep(10_000)
      const logins = await contributorLogins(slug)
      if (logins.length > 0 && !hasClaude(logins)) {
        console.log(c.green(`  contributors now: ${logins.join(', ')}`))
        return
      }
    }
    console.log(c.yellow('  the list still shows the account'))
  }
  console.log(c.yellow('The history is clean on GitHub; the contributors list may still be cached. Re-check in a private window in a few minutes, or run this again.'))
}

main().catch((e) => {
  console.error(c.red(String(e?.message ?? e)))
  process.exit(1)
})
