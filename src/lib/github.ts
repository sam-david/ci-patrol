import { spawn } from "child_process";

const ORG = process.env.GITHUB_ORG!;
const REPO = process.env.GITHUB_REPO!;

function gh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`gh exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run gh CLI: ${err.message}`));
    });
  });
}

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export interface PR {
  number: number;
  title: string;
  branch: string;
  updatedAt: string;
  author: string;
  draft: boolean;
}

/** Get the currently authenticated GitHub user */
export async function getCurrentUser(): Promise<GitHubUser> {
  const json = await gh(["api", "user"]);
  const user = JSON.parse(json);
  return { login: user.login, avatarUrl: user.avatar_url };
}

/** Fetch open PRs authored by the given user */
export async function fetchOpenPRs(author: string): Promise<PR[]> {
  const json = await gh([
    "pr",
    "list",
    "--repo", `${ORG}/${REPO}`,
    "--author", author,
    "--state", "open",
    "--json", "number,title,headRefName,updatedAt,author,isDraft",
    "--limit", "50",
  ]);

  const prs = JSON.parse(json);

  return prs.map(
    (pr: {
      number: number;
      title: string;
      headRefName: string;
      updatedAt: string;
      author: { login: string };
      isDraft: boolean;
    }) => ({
      number: pr.number,
      title: pr.title,
      branch: pr.headRefName,
      updatedAt: pr.updatedAt,
      author: pr.author.login,
      draft: pr.isDraft,
    })
  );
}

/** Fetch the diff for a PR */
export async function fetchPRDiff(prNumber: number): Promise<string> {
  const diff = await gh([
    "pr",
    "diff",
    String(prNumber),
    "--repo", `${ORG}/${REPO}`,
  ]);

  // Truncate very large diffs to avoid blowing up Claude's context
  const maxLength = 50_000;
  if (diff.length > maxLength) {
    return diff.slice(0, maxLength) + "\n\n... [diff truncated]";
  }
  return diff;
}
