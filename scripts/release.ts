#!/usr/bin/env bun
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ── Colors for CLI Output ──────────────────────────────────────────────────
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function run(command: string, options: { silent?: boolean } = {}): string {
  try {
    return execSync(command, {
      encoding: "utf-8",
      stdio: options.silent ? "pipe" : ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: any) {
    if (options.silent) return "";
    throw err;
  }
}

// ── Helper Types ───────────────────────────────────────────────────────────
type BumpType = "patch" | "minor" | "major";

interface CommitInfo {
  hash: string;
  subject: string;
  author: string;
  date: string;
}

interface CategorizedCommits {
  features: string[];
  fixes: string[];
  improvements: string[];
  docs: string[];
  maintenance: string[];
  others: string[];
}

// ── Main Release Logic ─────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`\n${colors.bold}${colors.cyan}🚀 YPanel Release & Walkthrough Generator${colors.reset}`);
    console.log(`\nPenggunaan:`);
    console.log(`  bun run release:patch     Naikkan versi patch (misal 3.0.0 -> 3.0.1)`);
    console.log(`  bun run release:minor     Naikkan versi minor (misal 3.0.0 -> 3.1.0)`);
    console.log(`  bun run release:major     Naikkan versi major (misal 3.0.0 -> 4.0.0)`);
    console.log(`  bun run release:dry-run   Simulasi rilis tanpa merubah disk/git`);
    console.log(`\nOpsi Tambahan:`);
    console.log(`  --dry-run                 Pratinjau walkthrough tanpa commit/tag/push`);
    console.log(`  --no-push                 Buat commit & tag lokal tanpa git push`);
    console.log(`  <custom-version>          Tentukan nomor versi manual (misal 3.0.5)\n`);
    process.exit(0);
  }

  const isDryRun = args.includes("--dry-run");
  const isNoPush = args.includes("--no-push");

  const cleanArgs = args.filter((a) => !a.startsWith("--"));
  let bumpArg = cleanArgs[0] || "patch";

  console.log(`\n${colors.bold}${colors.cyan}🚀 YPanel Release & Walkthrough Generator${colors.reset}`);
  if (isDryRun) {
    console.log(`${colors.yellow}⚠️  MODE DRY-RUN: Tidak ada commit/tag/push yang akan dieksekusi.${colors.reset}`);
  }

  // 1. Read package.json
  const pkgPath = path.resolve(process.cwd(), "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error(`${colors.red}Error: package.json tidak ditemukan!${colors.reset}`);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const currentVersion: string = pkg.version || "1.0.0";

  // 2. Compute Next Version
  let nextVersion: string;
  if (["patch", "minor", "major"].includes(bumpArg.toLowerCase())) {
    nextVersion = incrementVersion(currentVersion, bumpArg.toLowerCase() as BumpType);
  } else if (/^\d+\.\d+\.\d+.*$/.test(bumpArg)) {
    nextVersion = bumpArg.replace(/^v/, "");
  } else {
    console.log(`${colors.yellow}Tipe rilis "${bumpArg}" tidak dikenal. Menggunakan default: "patch".${colors.reset}`);
    nextVersion = incrementVersion(currentVersion, "patch");
  }

  const nextTag = `v${nextVersion}`;
  console.log(`Versi saat ini: ${colors.bold}${currentVersion}${colors.reset}`);
  console.log(`Versi rilis baru: ${colors.bold}${colors.green}${nextVersion}${colors.reset} (Tag: ${nextTag})\n`);

  // 3. Find Last Git Tag
  let lastTag = "";
  try {
    lastTag = run("git describe --tags --abbrev=0", { silent: true });
  } catch {
    lastTag = "";
  }

  // 4. Retrieve Commits Since Last Tag
  let logRange = lastTag ? `${lastTag}..HEAD` : "HEAD~10..HEAD";
  let rawLog = "";

  try {
    rawLog = run(`git log ${logRange} --pretty=format:"%h|%s|%an|%ad" --date=short`, { silent: true });
  } catch {
    rawLog = "";
  }

  // If no commits between last tag and HEAD (e.g. HEAD is already tagged or empty)
  if (!rawLog) {
    try {
      rawLog = run(`git log -n 5 --pretty=format:"%h|%s|%an|%ad" --date=short`, { silent: true });
    } catch {
      rawLog = "";
    }
  }

  const commits: CommitInfo[] = [];
  if (rawLog) {
    for (const line of rawLog.split("\n")) {
      const [hash, subject, author, date] = line.split("|");
      if (hash && subject) {
        // Skip automated version bump commits
        if (/^\d+\.\d+\.\d+$/.test(subject.trim()) || /^v\d+\.\d+\.\d+$/.test(subject.trim()) || subject.startsWith("chore(release):")) {
          continue;
        }
        commits.push({ hash, subject: subject.trim(), author: author || "", date: date || "" });
      }
    }
  }

  // 5. Categorize Commits
  const categories: CategorizedCommits = {
    features: [],
    fixes: [],
    improvements: [],
    docs: [],
    maintenance: [],
    others: [],
  };

  for (const c of commits) {
    const s = c.subject;
    const lower = s.toLowerCase();
    const entry = `- **${s}** (\`${c.hash}\` by ${c.author})`;

    if (/^feat(\(.*\))?:/i.test(s) || lower.includes("tambah") || lower.includes("fitur") || lower.includes("implement")) {
      categories.features.push(entry);
    } else if (/^fix(\(.*\))?:/i.test(s) || lower.includes("perbaiki") || lower.includes("bug") || lower.includes("error")) {
      categories.fixes.push(entry);
    } else if (/^refactor(\(.*\))?:/i.test(s) || /^perf(\(.*\))?:/i.test(s) || /^style(\(.*\))?:/i.test(s) || lower.includes("optim") || lower.includes("cleanup")) {
      categories.improvements.push(entry);
    } else if (/^docs(\(.*\))?:/i.test(s) || lower.includes("dokumentasi") || lower.includes("readme") || lower.includes("guide")) {
      categories.docs.push(entry);
    } else if (/^chore(\(.*\))?:/i.test(s) || /^build(\(.*\))?:/i.test(s) || /^ci(\(.*\))?:/i.test(s)) {
      categories.maintenance.push(entry);
    } else {
      categories.others.push(entry);
    }
  }

  // 6. Generate Markdown Walkthrough
  const today = new Date().toISOString().split("T")[0];
  const walkthrough = generateWalkthroughMarkdown(nextVersion, today, categories, commits);

  // Print Walkthrough to Terminal
  console.log(`${colors.bold}${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bold}📋 WALKTHROUGH & RELEASE NOTES (v${nextVersion}):${colors.reset}`);
  console.log(`${colors.bold}${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(walkthrough);
  console.log(`${colors.bold}${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  if (isDryRun) {
    console.log(`${colors.yellow}Dry-run selesai. Tidak ada perubahan yang disimpan ke disk atau Git.${colors.reset}`);
    return;
  }

  // 7. Update CHANGELOG.md
  updateChangelogFile(nextVersion, today, walkthrough);

  // 8. Update package.json
  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(`${colors.green}✓ package.json diperbarui ke v${nextVersion}${colors.reset}`);

  // 9. Git Commit, Tag & Push
  try {
    run("git add package.json CHANGELOG.md");
    
    // Check if there are staged changes
    const staged = run("git diff --cached --name-only", { silent: true });
    if (staged) {
      run(`git commit -m "chore(release): v${nextVersion}"`);
      console.log(`${colors.green}✓ Git commit dibuat: "chore(release): v${nextVersion}"${colors.reset}`);
    }

    // Create Annotated Tag with Walkthrough Summary
    const tagSummary = `Release v${nextVersion}\n\n${walkthrough}`;
    const tmpMsgFile = path.resolve(process.cwd(), `.git-tag-msg-${Date.now()}.txt`);
    try {
      fs.writeFileSync(tmpMsgFile, tagSummary + "\n", "utf-8");
      run(`git tag -a ${nextTag} -F "${tmpMsgFile}"`);
      console.log(`${colors.green}✓ Git annotated tag dibuat: ${nextTag}${colors.reset}`);
    } finally {
      if (fs.existsSync(tmpMsgFile)) {
        try { fs.unlinkSync(tmpMsgFile); } catch {}
      }
    }

    if (!isNoPush) {
      console.log(`Mendorong commit dan tag ke remote repository...`);
      run("git push --follow-tags");
      console.log(`${colors.bold}${colors.green}🎉 Sukses! Rilis v${nextVersion} berhasil di-push ke GitHub.${colors.reset}`);
      console.log(`${colors.cyan}GitHub Actions akan otomatis memicu build installer publik.${colors.reset}\n`);
    } else {
      console.log(`${colors.yellow}Opsi --no-push aktif. Tag ${nextTag} dibuat lokal (belum di-push).${colors.reset}`);
    }
  } catch (err: any) {
    console.error(`${colors.red}Gagal menjalankan perintah Git:${colors.reset}`, err.message);
    process.exit(1);
  }
}

// ── Version Increment Helper ───────────────────────────────────────────────
function incrementVersion(version: string, type: BumpType): string {
  const parts = version.split(".").map((p) => parseInt(p, 10));
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

  return parts.join(".");
}

// ── Markdown Walkthrough Generator ─────────────────────────────────────────
function generateWalkthroughMarkdown(
  version: string,
  date: string,
  cat: CategorizedCommits,
  allCommits: CommitInfo[]
): string {
  const sections: string[] = [];

  sections.push(`## [${version}] - ${date}`);

  let totalChanges =
    cat.features.length +
    cat.fixes.length +
    cat.improvements.length +
    cat.docs.length +
    cat.maintenance.length +
    cat.others.length;

  // Overview Summary
  sections.push(`\n### 🌟 Ringkasan Rilis (Release Overview)`);
  if (totalChanges === 0) {
    sections.push(`- Pembaruan rutin stabilitas, dependensi, dan peningkatan performa sistem YPanel.`);
  } else {
    sections.push(`Rilis versi **v${version}** mencakup ${totalChanges} pembaruan penting berikut:`);
  }

  // Features
  if (cat.features.length > 0) {
    sections.push(`\n### 🚀 Fitur Baru (Added / Features)\n` + cat.features.join("\n"));
  }

  // Fixes
  if (cat.fixes.length > 0) {
    sections.push(`\n### 🐛 Perbaikan Bug (Fixed)\n` + cat.fixes.join("\n"));
  }

  // Improvements
  if (cat.improvements.length > 0) {
    sections.push(`\n### ⚡ Peningkatan & Refaktor (Changed / Improved)\n` + cat.improvements.join("\n"));
  }

  // Documentation
  if (cat.docs.length > 0) {
    sections.push(`\n### 📚 Dokumentasi (Documentation)\n` + cat.docs.join("\n"));
  }

  // Maintenance & Others
  if (cat.maintenance.length > 0 || cat.others.length > 0) {
    const maintList = [...cat.maintenance, ...cat.others];
    sections.push(`\n### 🔧 Pemeliharaan & Dependensi (Chores & Maintenance)\n` + maintList.join("\n"));
  }

  return sections.join("\n");
}

// ── CHANGELOG.md Injector ──────────────────────────────────────────────────
function updateChangelogFile(version: string, date: string, newEntry: string) {
  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  let content = "";
  if (fs.existsSync(changelogPath)) {
    content = fs.readFileSync(changelogPath, "utf-8");
  } else {
    content = `# Changelog\n\nAll notable changes to the YPanel project will be documented in this file.\n\n`;
  }

  const headerRegex = /# Changelog\s*\n\s*(All notable changes[^\n]*\n)?/i;
  const match = content.match(headerRegex);

  let updatedContent = "";
  if (match) {
    const headerEndIndex = match.index! + match[0].length;
    const headerPart = content.slice(0, headerEndIndex);
    const restPart = content.slice(headerEndIndex).trim();

    updatedContent = `${headerPart}\n${newEntry}\n\n${restPart}`.trim() + "\n";
  } else {
    updatedContent = `# Changelog\n\n${newEntry}\n\n${content}`.trim() + "\n";
  }

  fs.writeFileSync(changelogPath, updatedContent, "utf-8");
  console.log(`${colors.green}✓ CHANGELOG.md diperbarui dengan entri v${version}${colors.reset}`);
}

function escapeGitTagMessage(msg: string): string {
  return msg.replace(/"/g, '\\"').replace(/`/g, "\\`");
}

main().catch((err) => {
  console.error(`${colors.red}Release error:${colors.reset}`, err);
  process.exit(1);
});
