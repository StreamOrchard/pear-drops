// One branch, one worktree: .worktrees/<branch> inside the main checkout.
//   npm run worktree -- <branch> [--base <ref>]   new branch from origin/main (or <ref>), npm install
//   npm run worktree -- --clean                   remove worktrees whose branch is merged (or squash-merged)
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (args.includes('--clean')) {
  git('fetch', '--prune', 'origin');
  const merged = new Set(git('branch', '--merged', 'origin/main', '--format=%(refname:short)').split('\n').filter(Boolean));
  // A squash merge leaves the branch's own commits out of main: its pull request says it was
  // merged, at the commit this branch is still at (so nothing newer is lost). Needs gh.
  const squashed = new Map();
  const prs = spawnSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'headRefName,headRefOid'], { cwd: ROOT, encoding: 'utf8' });
  if (prs.status === 0) for (const pr of JSON.parse(prs.stdout)) squashed.set(pr.headRefName, pr.headRefOid);
  const list = git('worktree', 'list', '--porcelain').split('\n\n').filter(Boolean);
  for (const entry of list) {
    const dir = entry.match(/^worktree (.+)$/m)?.[1];
    const branch = entry.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    if (!dir || !branch || branch === 'main' || !dir.includes(`${path.sep}.worktrees${path.sep}`)) continue;
    const squash = !merged.has(branch) && squashed.get(branch) === git('rev-parse', branch);
    if (!merged.has(branch) && !squash) continue;
    if (git('-C', dir, 'status', '--porcelain')) {
      console.log(`Kept ${branch}: it has uncommitted changes`);
      continue;
    }
    git('worktree', 'remove', dir);
    git('branch', squash ? '-D' : '-d', branch);
    console.log(`Removed ${branch}`);
  }
  process.exit(0);
}

const branch = args.find((a) => !a.startsWith('--'));
if (!branch) {
  console.error('Usage: npm run worktree -- <branch> [--base <ref>] | --clean');
  process.exit(1);
}
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : 'origin/main';
const dir = path.join(ROOT, '.worktrees', branch.replace(/[\\/]/g, '-'));
if (fs.existsSync(dir)) {
  console.log(`Already exists: ${dir}`);
  process.exit(0);
}
git('fetch', 'origin');
git('worktree', 'add', '-b', branch, dir, base);
const install = spawnSync(npm, ['install', '--no-fund', '--no-audit'], { cwd: dir, stdio: 'inherit' });
if (install.status !== 0) process.exit(install.status ?? 1);
spawnSync(process.execPath, [path.join(dir, 'scripts', 'harden.js')], { cwd: dir, stdio: 'inherit' });
console.log(`\nWork in: ${dir}`);
