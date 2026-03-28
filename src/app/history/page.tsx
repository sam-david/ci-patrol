"use client";

import { Nav } from "@/components/Nav";
import { AnalysisCard } from "@/components/AnalysisCard";
import { useUser } from "@/lib/hooks";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function HistoryPage() {
  const { user, isLoading: userLoading } = useUser();

  const { data, isLoading } = useSWR(
    user ? "/api/analyses" : null,
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
        <a
          href="/api/auth/github"
          className="rounded-lg bg-white px-6 py-3 text-gray-900 font-medium hover:bg-gray-200"
        >
          Sign in with GitHub
        </a>
      </div>
    );
  }

  const analyses = data?.analyses ?? [];

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Analysis History</h1>

        {isLoading ? (
          <div className="text-gray-400 text-center py-12">
            Loading analyses...
          </div>
        ) : analyses.length === 0 ? (
          <div className="text-gray-400 text-center py-12">
            No analyses yet. Enable monitoring on a PR to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {analyses.map(
              (analysis: {
                id: string;
                verdict: string;
                reasoning: string;
                actionTaken: string;
                failedJobs: string;
                createdAt: string;
                monitor: {
                  branch: string;
                  prNumber: number;
                  prTitle: string;
                };
              }) => (
                <AnalysisCard key={analysis.id} analysis={analysis} />
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
