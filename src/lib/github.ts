const ORG = process.env.GITHUB_ORG!;
const REPO = process.env.GITHUB_REPO!;

interface GitHubPR {
  number: number;
  title: string;
  head: { ref: string };
  updated_at: string;
  user: { login: string };
  draft: boolean;
}

export interface PR {
  number: number;
  title: string;
  branch: string;
  updatedAt: string;
  author: string;
  draft: boolean;
}

export async function fetchOpenPRs(
  accessToken: string,
  author: string
): Promise<PR[]> {
  const res = await fetch(
    `https://api.github.com/repos/${ORG}/${REPO}/pulls?state=open&sort=updated&direction=desc&per_page=50`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const prs: GitHubPR[] = await res.json();

  return prs
    .filter((pr) => pr.user.login === author)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      branch: pr.head.ref,
      updatedAt: pr.updated_at,
      author: pr.user.login,
      draft: pr.draft,
    }));
}

export async function fetchPRDiff(
  accessToken: string,
  prNumber: number
): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${ORG}/${REPO}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3.diff",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub diff API error: ${res.status}`);
  }

  const diff = await res.text();
  // Truncate very large diffs to avoid blowing up Claude's context
  const maxLength = 50_000;
  if (diff.length > maxLength) {
    return diff.slice(0, maxLength) + "\n\n... [diff truncated]";
  }
  return diff;
}
