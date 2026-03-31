"use client";

import { StatusBadge } from "./StatusBadge";
import { MonitorToggle } from "./MonitorToggle";

interface PR {
  number: number;
  title: string;
  branch: string;
  updatedAt: string;
  ciStatus: string | null;
  approvalCount: number;
}

interface Monitor {
  id: string;
  active: boolean;
  maxReruns: number;
  rerunCount: number;
  analyses: { verdict: string; reasoning: string }[];
}

interface PRRowProps {
  pr: PR;
  monitor: Monitor | null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    flaky: {
      label: "Flaky",
      classes: "bg-orange-500/15 text-orange-400",
    },
    legitimate: {
      label: "Legitimate",
      classes: "bg-red-500/15 text-red-400",
    },
    unclear: {
      label: "Unclear",
      classes: "bg-gray-500/15 text-gray-400",
    },
  };

  const c = config[verdict] ?? config.unclear;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c.classes}`}>
      {c.label}
    </span>
  );
}

function ApprovalBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        0
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-400">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {count}
    </span>
  );
}

export function PRRow({ pr, monitor }: PRRowProps) {
  const latestAnalysis = monitor?.analyses?.[0];

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 hover:border-gray-700 transition-colors">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_ORG ?? "givecampus"}/${process.env.NEXT_PUBLIC_GITHUB_REPO ?? "givecampus"}/pull/${pr.number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-white hover:text-blue-400 truncate"
          >
            #{pr.number} {pr.title}
          </a>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono">
            {pr.branch}
          </code>
          <span>{timeAgo(pr.updatedAt)}</span>
          {latestAnalysis && <VerdictBadge verdict={latestAnalysis.verdict} />}
        </div>
      </div>

      <div className="flex items-center gap-4 ml-4">
        <ApprovalBadge count={pr.approvalCount} />
        <StatusBadge status={pr.ciStatus} />
        <MonitorToggle
          branch={pr.branch}
          prNumber={pr.number}
          prTitle={pr.title}
          monitor={monitor}
        />
      </div>
    </div>
  );
}
