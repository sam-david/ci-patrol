"use client";

import { Nav } from "@/components/Nav";
import { PRRow } from "@/components/PRRow";
import { useUser } from "@/lib/hooks";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Dashboard() {
  const { user, isLoading: userLoading } = useUser();

  const { data, isLoading: prsLoading } = useSWR(
    user ? "/api/prs" : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const { data: monitorsData } = useSWR(
    user ? "/api/monitors" : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <h1 className="text-4xl font-bold">CI Patrol</h1>
        <p className="text-gray-400">
          Monitor CI runs, detect flaky tests, and automate reruns
        </p>
        <a
          href="/api/auth/github"
          className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-gray-900 font-medium hover:bg-gray-200 transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Sign in with GitHub
        </a>
      </div>
    );
  }

  const prs = data?.prs ?? [];
  const monitors = monitorsData?.monitors ?? [];
  interface Monitor {
    id: string;
    branch: string;
    active: boolean;
    maxReruns: number;
    rerunCount: number;
    analyses: { verdict: string; reasoning: string }[];
  }

  const monitorsByBranch = new Map<string, Monitor>(
    monitors.map((m: Monitor) => [m.branch, m])
  );

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Your Open PRs</h1>
          <span className="text-sm text-gray-400">
            {prs.length} PR{prs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {prsLoading ? (
          <div className="text-gray-400 text-center py-12">
            Loading pull requests...
          </div>
        ) : prs.length === 0 ? (
          <div className="text-gray-400 text-center py-12">
            No open pull requests found.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {prs.map(
              (pr: {
                number: number;
                title: string;
                branch: string;
                updatedAt: string;
                ciStatus: string | null;
              }) => (
                <PRRow
                  key={pr.number}
                  pr={pr}
                  monitor={monitorsByBranch.get(pr.branch) ?? null}
                />
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
