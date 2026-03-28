interface AnalysisCardProps {
  analysis: {
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
  };
}

const VERDICT_STYLES: Record<string, { label: string; icon: string; classes: string }> = {
  flaky: {
    label: "Flaky",
    icon: "↻",
    classes: "border-orange-500/30 bg-orange-500/5",
  },
  legitimate: {
    label: "Legitimate Failure",
    icon: "✕",
    classes: "border-red-500/30 bg-red-500/5",
  },
  unclear: {
    label: "Unclear",
    icon: "?",
    classes: "border-gray-500/30 bg-gray-500/5",
  },
};

const ACTION_LABELS: Record<string, string> = {
  rerun: "Auto-rerun triggered",
  notified: "Engineer notified",
  none: "No action taken",
};

export function AnalysisCard({ analysis }: AnalysisCardProps) {
  const style = VERDICT_STYLES[analysis.verdict] ?? VERDICT_STYLES.unclear;

  let failedJobs: { jobName: string; failedTests: string[] }[] = [];
  try {
    failedJobs = JSON.parse(analysis.failedJobs);
  } catch {
    // ignore parse errors
  }

  return (
    <div
      className={`rounded-lg border p-4 ${style.classes}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{style.icon}</span>
            <span className="font-medium text-white">{style.label}</span>
            <span className="text-xs text-gray-500">
              {ACTION_LABELS[analysis.actionTaken] ?? analysis.actionTaken}
            </span>
          </div>
          <a
            href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_ORG ?? "givecampus"}/${process.env.NEXT_PUBLIC_GITHUB_REPO ?? "givecampus"}/pull/${analysis.monitor.prNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            #{analysis.monitor.prNumber} {analysis.monitor.prTitle}
          </a>
          <div className="text-xs text-gray-500 mt-0.5">
            <code>{analysis.monitor.branch}</code>
            {" · "}
            {new Date(analysis.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-300 mt-2">{analysis.reasoning}</p>

      {failedJobs.length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          <span className="font-medium">Failed jobs:</span>{" "}
          {failedJobs.map((j) => j.jobName).join(", ")}
        </div>
      )}
    </div>
  );
}
