interface StatusBadgeProps {
  status: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  success: {
    label: "Passed",
    classes: "bg-green-500/15 text-green-400 border-green-500/30",
  },
  failed: {
    label: "Failed",
    classes: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  running: {
    label: "Running",
    classes: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  },
  pending: {
    label: "Pending",
    classes: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  },
  canceled: {
    label: "Canceled",
    classes: "bg-gray-500/15 text-gray-500 border-gray-500/30",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status ?? ""] ?? {
    label: status ?? "Unknown",
    classes: "bg-gray-500/15 text-gray-500 border-gray-500/30",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {status === "running" && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
      )}
      {config.label}
    </span>
  );
}
