"use client";

import { Nav } from "@/components/Nav";
import { useUser } from "@/lib/hooks";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TopFlaker {
  file: string;
  count: number;
  lastSeen: string;
  errorClasses: string[];
  jobNames: string[];
  branches: string[];
  recentErrors: string[];
}

interface RecentFlake {
  id: string;
  file: string;
  name: string;
  errorMessage: string;
  errorClass: string | null;
  jobName: string;
  branch: string;
  prNumber: number;
  createdAt: string;
}

export default function FlakyPage() {
  const { user, isLoading: userLoading } = useUser();
  const { data, isLoading } = useSWR(
    user ? "/api/flaky-specs" : null,
    fetcher,
    { refreshInterval: 30000 }
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Not authenticated</div>
      </div>
    );
  }

  const summary = data?.summary ?? { totalFlakes: 0, uniqueSpecs: 0, uniqueErrorClasses: 0 };
  const topFlakers: TopFlaker[] = data?.topFlakers ?? [];
  const recentFlakes: RecentFlake[] = data?.recentFlakes ?? [];

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Flaky Specs</h1>

        {isLoading ? (
          <div className="text-gray-400 text-center py-12">Loading...</div>
        ) : summary.totalFlakes === 0 ? (
          <div className="text-gray-400 text-center py-12">
            No flaky specs recorded yet. Data is captured automatically when CI Patrol detects flaky failures.
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <div className="text-3xl font-bold text-orange-400">{summary.totalFlakes}</div>
                <div className="text-sm text-gray-400">Total flake occurrences</div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <div className="text-3xl font-bold text-yellow-400">{summary.uniqueSpecs}</div>
                <div className="text-sm text-gray-400">Unique flaky specs</div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <div className="text-3xl font-bold text-red-400">{summary.uniqueErrorClasses}</div>
                <div className="text-sm text-gray-400">Unique error types</div>
              </div>
            </div>

            {/* Top flakers */}
            <h2 className="text-lg font-semibold mb-3">Most Frequent Flakers</h2>
            <div className="flex flex-col gap-2 mb-8">
              {topFlakers.map((spec) => (
                <div
                  key={spec.file}
                  className="rounded-lg border border-gray-800 bg-gray-900 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <code className="text-sm text-white break-all">{spec.file}</code>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs font-medium text-orange-400">
                          {spec.count}x
                        </span>
                        {spec.errorClasses.map((ec) => (
                          <span
                            key={ec}
                            className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400"
                          >
                            {ec}
                          </span>
                        ))}
                        {spec.jobNames.map((jn) => (
                          <span
                            key={jn}
                            className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400"
                          >
                            {jn}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      Last: {new Date(spec.lastSeen).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent flakes */}
            <h2 className="text-lg font-semibold mb-3">Recent Flakes</h2>
            <div className="flex flex-col gap-2">
              {recentFlakes.map((flake) => (
                <div
                  key={flake.id}
                  className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <code className="text-sm text-white break-all">{flake.file}</code>
                      <div className="text-xs text-gray-500 mt-0.5">{flake.name}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {flake.errorClass && (
                          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-400">
                            {flake.errorClass}
                          </span>
                        )}
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400">
                          {flake.jobName}
                        </span>
                        <code className="text-xs text-gray-500">{flake.branch}</code>
                        <span className="text-xs text-gray-500">PR #{flake.prNumber}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(flake.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-600 font-mono truncate">
                    {flake.errorMessage}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
