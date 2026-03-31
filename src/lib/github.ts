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
  approvalCount: number;
  reviewDecision: string | null;
  hasReadyToMerge: boolean;
}

/** Get the currently authenticated GitHub user */
export async function getCurrentUser(): Promise<GitHubUser> {
  const json = await gh(["api", "user"]);
  const user = JSON.parse(json);
  return { login: user.login, avatarUrl: user.avatar_url };
}

const PR_JSON_FIELDS = "number,title,headRefName,updatedAt,author,isDraft,reviews,reviewDecision,labels,assignees";

/** Fetch open PRs authored by or assigned to the given user */
export async function fetchOpenPRs(user: string): Promise<PR[]> {
  // gh pr list doesn't support --author + --assignee together, so fetch both and dedupe
  const [authorJson, assigneeJson] = await Promise.all([
    gh([
      "pr", "list",
      "--repo", `${ORG}/${REPO}`,
      "--author", user,
      "--state", "open",
      "--json", PR_JSON_FIELDS,
      "--limit", "50",
    ]),
    gh([
      "pr", "list",
      "--repo", `${ORG}/${REPO}`,
      "--assignee", user,
      "--state", "open",
      "--json", PR_JSON_FIELDS,
      "--limit", "50",
    ]),
  ]);

  const allPrs = [...JSON.parse(authorJson), ...JSON.parse(assigneeJson)];

  // Deduplicate by PR number
  const seen = new Set<number>();
  const uniquePrs = allPrs.filter((pr: { number: number }) => {
    if (seen.has(pr.number)) return false;
    seen.add(pr.number);
    return true;
  });

  return uniquePrs.map(
    (pr: {
      number: number;
      title: string;
      headRefName: string;
      updatedAt: string;
      author: { login: string };
      isDraft: boolean;
      reviews: { state: string; author: { login: string } }[];
      reviewDecision: string;
      labels: { name: string }[];
    }) => {
      // Count unique approvals (a reviewer may have multiple reviews, only latest matters)
      const latestByReviewer = new Map<string, string>();
      for (const review of pr.reviews) {
        latestByReviewer.set(review.author.login, review.state);
      }
      const approvalCount = Array.from(latestByReviewer.values()).filter(
        (state) => state === "APPROVED"
      ).length;

      return {
        number: pr.number,
        title: pr.title,
        branch: pr.headRefName,
        updatedAt: pr.updatedAt,
        author: pr.author.login,
        draft: pr.isDraft,
        approvalCount,
        reviewDecision: pr.reviewDecision || null,
        hasReadyToMerge: pr.labels.some((l) => l.name === "ready-to-merge"),
      };
    }
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

/** Add the ready-to-merge label to a PR */
export async function addReadyToMergeLabel(prNumber: number): Promise<void> {
  await gh([
    "pr",
    "edit",
    String(prNumber),
    "--repo", `${ORG}/${REPO}`,
    "--add-label", "ready-to-merge",
  ]);
  console.log(`[CI Patrol] Added ready-to-merge label to PR #${prNumber}`);
}
