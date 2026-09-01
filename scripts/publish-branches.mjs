import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  })?.trim();
}

const repositoryRoot = git(["rev-parse", "--show-toplevel"], { capture: true });
const sourceBranch = git(["branch", "--show-current"], { capture: true });
const status = git(["status", "--porcelain"], { capture: true });

if (!sourceBranch) {
  throw new Error("目前是 detached HEAD，請先切換到要發布的分支。");
}
if (status) {
  throw new Error("工作區仍有未提交變更，請先提交後再執行發布命令。");
}

git(["fetch", "origin", "develop", "main"], { cwd: repositoryRoot });

const sourceCommit = git(["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  capture: true,
});
const temporaryWorktree = mkdtempSync(join(tmpdir(), "fccd-publish-"));

try {
  git(["worktree", "add", "--detach", temporaryWorktree, "origin/develop"], {
    cwd: repositoryRoot,
  });
  git(["merge", "--no-edit", sourceCommit], { cwd: temporaryWorktree });
  git(["push", "origin", "HEAD:develop"], { cwd: temporaryWorktree });

  const developCommit = git(["rev-parse", "HEAD"], {
    cwd: temporaryWorktree,
    capture: true,
  });
  git(["switch", "--detach", "origin/main"], { cwd: temporaryWorktree });
  git(["merge", "--no-edit", developCommit], { cwd: temporaryWorktree });
  git(["push", "origin", "HEAD:main"], { cwd: temporaryWorktree });

  console.log(`已將 ${sourceBranch} 合併並推送到 origin/develop 及 origin/main。`);
} finally {
  git(["worktree", "remove", "--force", temporaryWorktree], {
    cwd: repositoryRoot,
  });
}
