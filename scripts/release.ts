#!/usr/bin/env bun
import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

// ── Colors for CLI Output ──────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

type BumpType = "patch" | "minor" | "major";
type Kind = "feat" | "fix" | "perf" | "refactor" | "docs" | "maintenance" | "other";

interface Commit {
  hash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  type: string;
  scope: string;
  description: string;
  kind: Kind;
  breaking: boolean;
  breakingNote: string;
}

// ── Process helpers ────────────────────────────────────────────────────────
function git(args: string[], opts: { allowFail?: boolean } = {}): string {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    if (opts.allowFail) return "";
    throw err;
  }
}

function runStep(label: string, cmd: string, args: string[]): boolean {
  process.stdout.write(`  ${c.gray}•${c.reset} ${label} ... `);
  const res = spawnSync(cmd, args, { encoding: "utf-8", shell: process.platform === "win32" });
  if (res.status === 0) {
    console.log(`${c.green}ok${c.reset}`);
    return true;
  }
  console.log(`${c.red}gagal${c.reset}`);
  const out = `${res.stdout || ""}${res.stderr || ""}`.trim().split("\n").slice(-15).join("\n");
  if (out) console.log(`${c.gray}${out}${c.reset}`);
  return false;
}

function help() {
  console.log(`\n${c.bold}${c.cyan}Reneo Release & Release Notes Generator${c.reset}

Penggunaan:
  bun run release:patch      3.1.5 -> 3.1.6
  bun run release:minor      3.1.5 -> 3.2.0
  bun run release:major      3.1.5 -> 4.0.0
  bun run release            otomatis: naik versi menurut isi commit (lihat di bawah)
  bun run release 3.2.0      nomor manual
  bun run release:notes      Pratinjau catatan rilis (sama dengan --dry-run)

Naik versi otomatis (semver, dari Conventional Commits sejak tag terakhir):
  ada breaking change (\`!\` atau BREAKING CHANGE:)   -> major
  ada feat                                          -> minor
  selain itu (fix, perf, refactor, docs, chore)      -> patch
  patch/minor/major yang dipilih sendiri lebih rendah dari anjuran tetap diizinkan, dengan peringatan.

Opsi:
  --dry-run        Pratinjau catatan rilis tanpa mengubah file, commit, atau tag
  --no-push        Commit dan tag lokal saja, tanpa git push
  --skip-checks    Lewati validasi sebelum rilis (tsc, check:ui, go build, go test)
  --allow-dirty    Izinkan working tree dengan perubahan yang belum di-commit

Validasi sebelum rilis: working tree bersih, HEAD belum bertag, build dan tes lolos.
Catatan rilis dibuat dari Conventional Commits sejak tag terakhir (feat, fix, perf,
refactor, docs, build/ci/chore) dengan penanda breaking change (\`!\` atau BREAKING CHANGE:).\n`);
}

// ── Version ────────────────────────────────────────────────────────────────
function incrementVersion(version: string, type: BumpType): string {
  const parts = version.split(".").map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  if (type === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  return parts.slice(0, 3).join(".");
}

// ── Commit parsing ─────────────────────────────────────────────────────────
const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

function classify(type: string, subject: string): Kind {
  switch (type.toLowerCase()) {
    case "feat":
    case "feature":
      return "feat";
    case "fix":
    case "hotfix":
      return "fix";
    case "perf":
      return "perf";
    case "refactor":
    case "style":
      return "refactor";
    case "docs":
    case "doc":
      return "docs";
    case "chore":
    case "build":
    case "ci":
    case "test":
    case "tests":
    case "revert":
      return "maintenance";
  }
  // Free-form (non-conventional) subjects: fall back to keywords
  const s = subject.toLowerCase();
  if (/\b(fix|perbaiki|bug|hotfix)\b/.test(s)) return "fix";
  if (/\b(tambah|tambahkan|fitur|implement|add)\b/.test(s)) return "feat";
  if (/\b(refactor|optimi[sz]e|cleanup|rapikan)\b/.test(s)) return "refactor";
  if (/\b(docs?|dokumentasi|readme)\b/.test(s)) return "docs";
  return "other";
}

function readCommits(range: string): Commit[] {
  const SEP = "\x1e";
  const FIELD = "\x1f";
  const raw = git(["log", range, `--pretty=format:%h${FIELD}%an${FIELD}%ad${FIELD}%s${FIELD}%b${SEP}`, "--date=short", "--no-merges"], {
    allowFail: true,
  });
  if (!raw) return [];

  const commits: Commit[] = [];
  for (const record of raw.split(SEP)) {
    const [hash, author, date, subject, body = ""] = record.replace(/^\n+/, "").split(FIELD);
    if (!hash || !subject) continue;
    const subj = subject.trim();
    // Automated version bump commits are not release content
    if (/^v?\d+\.\d+\.\d+$/.test(subj) || subj.startsWith("chore(release):")) continue;

    const m = subj.match(CONVENTIONAL);
    const type = m?.[1] ?? "";
    const scope = m?.[2] ?? "";
    const description = (m?.[4] ?? subj).trim();
    const bodyText = body.trim();
    const noteMatch = bodyText.match(/BREAKING[ -]CHANGE:\s*([\s\S]+?)(?:\n\n|$)/);

    commits.push({
      hash,
      author: author || "",
      date: date || "",
      subject: subj,
      body: bodyText,
      type,
      scope,
      description,
      kind: classify(type, subj),
      breaking: Boolean(m?.[3]) || Boolean(noteMatch),
      breakingNote: noteMatch ? noteMatch[1].replace(/\s+/g, " ").trim() : "",
    });
  }
  return commits;
}

// ── Bump recommendation ────────────────────────────────────────────────────
const BUMP_RANK: Record<BumpType, number> = { patch: 0, minor: 1, major: 2 }

// What semver asks for, given what is in the release
function recommendBump(commits: Commit[]): { bump: BumpType; reason: string } {
  const breaking = commits.filter((cm) => cm.breaking);
  if (breaking.length > 0) return { bump: "major", reason: `${breaking.length} breaking change` };
  const feats = commits.filter((cm) => cm.kind === "feat");
  if (feats.length > 0) return { bump: "minor", reason: `${feats.length} fitur baru` };
  return { bump: "patch", reason: "hanya perbaikan, peningkatan, dokumentasi, atau pemeliharaan" };
}

// ── Release notes ──────────────────────────────────────────────────────────
function repoWebUrl(): string {
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { allowFail: true });
  const remote = upstream.includes("/") ? upstream.split("/")[0] : git(["remote"], { allowFail: true }).split("\n")[0];
  const url = remote ? git(["remote", "get-url", remote], { allowFail: true }) : "";
  return url
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/\.git$/, "");
}

// Plain titles: the app shows these notes in its Changelog window, where emoji do not belong
const SECTIONS: Array<{ kind: Kind; title: string }> = [
  { kind: "feat", title: "Fitur baru" },
  { kind: "fix", title: "Perbaikan" },
  { kind: "perf", title: "Performa" },
  { kind: "refactor", title: "Peningkatan" },
  { kind: "docs", title: "Dokumentasi" },
  { kind: "maintenance", title: "Pemeliharaan" },
  { kind: "other", title: "Lainnya" },
];

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function entryLine(commit: Commit, repo: string): string {
  const link = repo ? `[\`${commit.hash}\`](${repo}/commit/${commit.hash})` : `\`${commit.hash}\``;
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  return `- ${scope}${capitalize(commit.description)} (${link})`;
}

// Same kind + scope are grouped together so related changes read as one block
function renderSection(commits: Commit[], repo: string): string {
  const sorted = [...commits].sort((a, b) => (a.scope || "~").localeCompare(b.scope || "~"));
  return sorted.map((cm) => entryLine(cm, repo)).join("\n");
}

function generateNotes(opts: {
  version: string;
  date: string;
  commits: Commit[];
  repo: string;
  prevTag: string;
  tag: string;
  stats: string;
}): string {
  const { version, date, commits, repo, prevTag, tag, stats } = opts;
  const out: string[] = [`## [${version}] - ${date}`];

  const counts = (kind: Kind) => commits.filter((cm) => cm.kind === kind).length;
  const summaryParts = [
    counts("feat") ? `${counts("feat")} fitur` : "",
    counts("fix") ? `${counts("fix")} perbaikan` : "",
    counts("perf") + counts("refactor") ? `${counts("perf") + counts("refactor")} peningkatan` : "",
    counts("docs") ? `${counts("docs")} dokumentasi` : "",
    counts("maintenance") + counts("other") ? `${counts("maintenance") + counts("other")} pemeliharaan` : "",
  ].filter(Boolean);

  out.push(`\n### Ringkasan`);
  if (commits.length === 0) {
    out.push(`Pembaruan rutin stabilitas dan pemeliharaan sistem Reneo.`);
  } else {
    out.push(`Rilis **v${version}** berisi ${commits.length} perubahan: ${summaryParts.join(", ")}.${stats ? ` ${stats}` : ""}`);
  }

  const breaking = commits.filter((cm) => cm.breaking);
  if (breaking.length > 0) {
    const lines = breaking.map((cm) => `${entryLine(cm, repo)}${cm.breakingNote ? `\n  - ${cm.breakingNote}` : ""}`);
    out.push(`\n### Perubahan breaking\n${lines.join("\n")}`);
  }

  for (const { kind, title } of SECTIONS) {
    const items = commits.filter((cm) => cm.kind === kind && !cm.breaking);
    if (items.length > 0) out.push(`\n### ${title}\n${renderSection(items, repo)}`);
  }

  const authors = [...new Set(commits.map((cm) => cm.author).filter(Boolean))];
  if (authors.length > 0) out.push(`\n### Kontributor\n${authors.map((a) => `- ${a}`).join("\n")}`);

  if (repo && prevTag) {
    out.push(`\n**Semua perubahan**: ${repo}/compare/${prevTag}...${tag}`);
  }
  return out.join("\n");
}

// ── CHANGELOG.md ───────────────────────────────────────────────────────────
function updateChangelogFile(version: string, entry: string) {
  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  const header = `# Changelog\n\nSemua perubahan penting pada Reneo dicatat di berkas ini.\n`;
  const content = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf-8") : header;

  if (content.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md sudah memuat entri untuk v${version}`);
  }

  const match = content.match(/# Changelog\s*\n\s*((?:All notable changes|Semua perubahan penting)[^\n]*\n)?/i);
  let updated: string;
  if (match) {
    const end = match.index! + match[0].length;
    updated = `${content.slice(0, end)}\n${entry}\n\n${content.slice(end).trim()}`.trim() + "\n";
  } else {
    updated = `${header}\n${entry}\n\n${content}`.trim() + "\n";
  }
  fs.writeFileSync(changelogPath, updated, "utf-8");
  console.log(`${c.green}✓ CHANGELOG.md diperbarui untuk v${version}${c.reset}`);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    help();
    return;
  }

  const isDryRun = args.includes("--dry-run");
  const isNoPush = args.includes("--no-push");
  const skipChecks = args.includes("--skip-checks");
  const allowDirty = args.includes("--allow-dirty");
  const bumpArg = args.filter((a) => !a.startsWith("--"))[0] || "auto";

  console.log(`\n${c.bold}${c.cyan}Reneo Release${c.reset}`);
  if (isDryRun) console.log(`${c.yellow}Mode dry-run: tidak ada file, commit, atau tag yang diubah.${c.reset}`);

  const pkgPath = path.resolve(process.cwd(), "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error(`${c.red}package.json tidak ditemukan.${c.reset}`);
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const currentVersion: string = pkg.version || "1.0.0";

  const branch = git(["branch", "--show-current"], { allowFail: true }) || "(detached)";
  const lastTag = git(["describe", "--tags", "--abbrev=0"], { allowFail: true });

  // The release content comes first: the version follows from it
  const commits = readCommits(lastTag ? `${lastTag}..HEAD` : "HEAD");
  const recommended = recommendBump(commits);

  let nextVersion: string;
  let how = "";
  if (bumpArg.toLowerCase() === "auto") {
    nextVersion = incrementVersion(currentVersion, recommended.bump);
    how = `otomatis: ${recommended.bump} (${recommended.reason})`;
  } else if (["patch", "minor", "major"].includes(bumpArg.toLowerCase())) {
    const chosen = bumpArg.toLowerCase() as BumpType;
    nextVersion = incrementVersion(currentVersion, chosen);
    how = `dipilih: ${chosen}`;
    if (BUMP_RANK[chosen] < BUMP_RANK[recommended.bump]) {
      console.log(`${c.yellow}Peringatan: isi rilis meminta ${recommended.bump} (${recommended.reason}), yang dipilih ${chosen}.${c.reset}`);
    }
  } else if (/^v?\d+\.\d+\.\d+(?:[-+][\w.]+)?$/.test(bumpArg)) {
    nextVersion = bumpArg.replace(/^v/, "");
    how = "nomor manual";
  } else {
    console.error(`${c.red}Argumen "${bumpArg}" tidak dikenal. Pakai auto, patch, minor, major, atau nomor versi (mis. 3.2.0).${c.reset}`);
    process.exit(1);
  }
  const nextTag = `v${nextVersion}`;

  console.log(`Branch: ${c.bold}${branch}${c.reset}`);
  console.log(`Versi: ${c.bold}${currentVersion}${c.reset} -> ${c.bold}${c.green}${nextVersion}${c.reset} (tag ${nextTag}, ${how})`);
  console.log(`Sejak tag: ${c.bold}${lastTag || "(belum ada tag)"}${c.reset}\n`);

  if (git(["tag", "--list", nextTag], { allowFail: true })) {
    console.error(`${c.red}Tag ${nextTag} sudah ada.${c.reset}`);
    process.exit(1);
  }

  // Nothing new since the last tag means nothing to release.
  if (lastTag && git(["rev-list", "--count", `${lastTag}..HEAD`], { allowFail: true }) === "0") {
    console.error(`${c.red}HEAD sudah bertag ${lastTag}; tidak ada perubahan baru untuk dirilis.${c.reset}`);
    process.exit(1);
  }

  const stats = lastTag ? git(["diff", "--shortstat", `${lastTag}..HEAD`], { allowFail: true }) : "";
  const notes = generateNotes({
    version: nextVersion,
    date: new Date().toISOString().split("T")[0],
    commits,
    repo: repoWebUrl(),
    prevTag: lastTag,
    tag: nextTag,
    stats: stats ? `(${stats.trim()})` : "",
  });

  console.log(`${c.bold}${c.green}${"━".repeat(66)}${c.reset}`);
  console.log(`${c.bold}Catatan rilis v${nextVersion}${c.reset}`);
  console.log(`${c.bold}${c.green}${"━".repeat(66)}${c.reset}`);
  console.log(notes);
  console.log(`${c.bold}${c.green}${"━".repeat(66)}${c.reset}\n`);

  if (isDryRun) {
    console.log(`${c.yellow}Dry-run selesai.${c.reset}`);
    return;
  }

  // Pre-flight: a release must be reproducible from what is committed
  const dirty = git(["status", "--porcelain", "--untracked-files=no"], { allowFail: true });
  if (dirty && !allowDirty) {
    console.error(`${c.red}Working tree belum bersih. Commit atau stash perubahan dulu (atau --allow-dirty):${c.reset}`);
    console.error(dirty.split("\n").slice(0, 12).join("\n"));
    process.exit(1);
  }

  if (!skipChecks) {
    console.log(`${c.bold}Validasi sebelum rilis${c.reset}`);
    const ok =
      runStep("TypeScript (tsc -b)", "bunx", ["tsc", "-b", "--pretty", "false"]) &&
      runStep("Aturan UI (check:ui)", "bun", ["run", "check:ui"]) &&
      runStep("Go build", "go", ["build", "./..."]) &&
      runStep("Go test", "go", ["test", "./..."]);
    if (!ok) {
      console.error(`\n${c.red}Validasi gagal. Rilis dibatalkan (pakai --skip-checks bila disengaja).${c.reset}`);
      process.exit(1);
    }
    console.log("");
  }

  updateChangelogFile(nextVersion, notes);
  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(`${c.green}✓ package.json diperbarui ke v${nextVersion}${c.reset}`);

  try {
    // Pathspec commit: only the release files, never other staged work
    git(["add", "package.json", "CHANGELOG.md"]);
    git(["commit", "-m", `chore(release): v${nextVersion}`, "--", "package.json", "CHANGELOG.md"]);
    console.log(`${c.green}✓ Commit: chore(release): v${nextVersion}${c.reset}`);

    const tmp = path.resolve(process.cwd(), `.git-tag-msg-${Date.now()}.txt`);
    try {
      fs.writeFileSync(tmp, `Release v${nextVersion}\n\n${notes}\n`, "utf-8");
      git(["tag", "-a", nextTag, "-F", tmp]);
      console.log(`${c.green}✓ Tag: ${nextTag}${c.reset}`);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }

    if (isNoPush) {
      console.log(`${c.yellow}--no-push aktif: commit dan tag ${nextTag} baru ada di lokal.${c.reset}`);
      return;
    }
    console.log(`Mendorong commit dan tag ke remote...`);
    git(["push", "--follow-tags"]);
    console.log(`${c.bold}${c.green}Rilis v${nextVersion} berhasil di-push.${c.reset}`);
    console.log(`${c.cyan}GitHub Actions akan membangun installer dari tag ${nextTag}.${c.reset}\n`);
  } catch (err: any) {
    console.error(`${c.red}Gagal menjalankan perintah Git:${c.reset}`, err.stderr?.toString() || err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${c.red}Release error:${c.reset}`, err);
  process.exit(1);
});
