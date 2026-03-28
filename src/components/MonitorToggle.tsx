"use client";

import { useState } from "react";
import { mutate } from "swr";

interface Monitor {
  id: string;
  active: boolean;
  maxReruns: number;
  rerunCount: number;
  analyses: { verdict: string; reasoning: string }[];
}

interface MonitorToggleProps {
  branch: string;
  prNumber: number;
  prTitle: string;
  monitor: Monitor | null;
}

export function MonitorToggle({
  branch,
  prNumber,
  prTitle,
  monitor,
}: MonitorToggleProps) {
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      if (monitor) {
        await fetch(`/api/monitors/${monitor.id}`, { method: "DELETE" });
      } else {
        await fetch("/api/monitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branch, prNumber, prTitle }),
        });
      }
      mutate("/api/monitors");
    } finally {
      setLoading(false);
    }
  }

  async function handleMaxRerunsChange(newMax: number) {
    if (!monitor) return;
    await fetch(`/api/monitors/${monitor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxReruns: newMax }),
    });
    mutate("/api/monitors");
  }

  return (
    <div className="flex items-center gap-3">
      {monitor && (
        <div className="flex items-center gap-2">
          {monitor.rerunCount > 0 && (
            <span className="text-xs text-gray-400">
              Rerun {monitor.rerunCount}/{monitor.maxReruns}
            </span>
          )}
          <select
            value={monitor.maxReruns}
            onChange={(e) => handleMaxRerunsChange(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300"
            aria-label="Max reruns"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Max {n}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={handleToggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
          monitor
            ? "bg-blue-600"
            : "bg-gray-700"
        }`}
        role="switch"
        aria-checked={!!monitor}
        aria-label={`${monitor ? "Disable" : "Enable"} monitoring for ${branch}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            monitor ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
