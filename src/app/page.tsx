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
          Could not detect GitHub user. Make sure the <code className="bg-gray-800 px-1.5 py-0.5 rounded">gh</code> CLI is installed and authenticated.
        </p>
        <code className="text-sm text-gray-500 bg-gray-800 px-3 py-2 rounded">
          gh auth login
        </code>
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
