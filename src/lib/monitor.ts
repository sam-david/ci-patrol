import { prisma } from "./db";
import {
  getLatestPipeline,
  getPipelineStatus,
  getFailedJobDetails,
  rerunWorkflowFromFailed,
} from "./circleci";
import { fetchPRDiff, addReadyToMergeLabel } from "./github";
import { analyzeFailure, type TestFailureInfo } from "./claude";
import {
  notifyPass,
  notifyFlakyRerun,
  notifyLegitimateFailure,
} from "./slack";

interface PollResult {
  monitorId: string;
  branch: string;
  action: "skipped" | "pass" | "rerun" | "notified_legitimate" | "notified_exhausted" | "error";
  detail?: string;
}

export async function runPollCycle(): Promise<PollResult[]> {
  const monitors = await prisma.monitor.findMany({
    where: { active: true },
    include: { user: true },
  });

  console.log(`[CI Patrol] Poll cycle: ${monitors.length} active monitor(s)`);

  const results: PollResult[] = [];

  for (const monitor of monitors) {
    try {
      console.log(`[CI Patrol] Checking ${monitor.branch} (pipeline: ${monitor.lastPipelineId ?? "none"}, status: ${monitor.lastStatus ?? "unknown"})`);
      const result = await processMonitor(monitor);
      console.log(`[CI Patrol] ${monitor.branch} → ${result.action}${result.detail ? `: ${result.detail}` : ""}`);
      results.push(result);
    } catch (error) {
      console.error(`[CI Patrol] Error processing ${monitor.branch}:`, error);
      results.push({
        monitorId: monitor.id,
        branch: monitor.branch,
        action: "error",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/** Process a single monitor by ID — used for immediate check on toggle */
export async function processMonitorById(monitorId: string): Promise<PollResult> {
  const monitor = await prisma.monitor.findUnique({
    where: { id: monitorId },
    include: { user: true },
  });

  if (!monitor || !monitor.active) {
    return { monitorId, branch: "unknown", action: "skipped", detail: "Monitor not found or inactive" };
  }

  return processMonitor(monitor);
}

// --- Background polling ---

const POLL_INTERVAL_MS = 45_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundPolling() {
  if (pollTimer) return; // already running

  console.log(`[CI Patrol] Starting background polling every ${POLL_INTERVAL_MS / 1000}s`);
  pollTimer = setInterval(async () => {
    try {
      const results = await runPollCycle();
      const active = results.filter((r) => r.action !== "skipped");
      if (active.length > 0) {
        console.log("[CI Patrol] Poll results:", active);
      }
    } catch (error) {
      console.error("[CI Patrol] Poll cycle error:", error);
    }
  }, POLL_INTERVAL_MS);
}

export function stopBackgroundPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[CI Patrol] Stopped background polling");
  }
}

async function processMonitor(
  monitor: {
    id: string;
    branch: string;
    prNumber: number;
    prTitle: string;
    lastPipelineId: string | null;
    lastStatus: string | null;
    rerunCount: number;
    maxReruns: number;
    readyToMerge: boolean;
    user: {
      id: string;
      githubLogin: string;
      slackUserId: string | null;
    };
  }
): Promise<PollResult> {
  const pipeline = await getLatestPipeline(monitor.branch);

  if (!pipeline) {
    return { monitorId: monitor.id, branch: monitor.branch, action: "skipped", detail: "No pipeline found" };
  }

  const status = await getPipelineStatus(pipeline.id);
  console.log(`[CI Patrol] ${monitor.branch}: pipeline ${pipeline.id} status=${status} (stored: ${monitor.lastPipelineId}, ${monitor.lastStatus})`);

  // No state change — skip
  if (pipeline.id === monitor.lastPipelineId && status === monitor.lastStatus) {
    return { monitorId: monitor.id, branch: monitor.branch, action: "skipped", detail: "No change" };
  }

  // New pipeline detected — reset rerun count
  if (pipeline.id !== monitor.lastPipelineId) {
    await prisma.monitor.update({
      where: { id: monitor.id },
      data: {
        lastPipelineId: pipeline.id,
        lastStatus: status,
        rerunCount: 0,
      },
    });

    if (status === "running" || status === "pending") {
      return { monitorId: monitor.id, branch: monitor.branch, action: "skipped", detail: "New pipeline, still running" };
    }
  } else {
    // Same pipeline, status changed
    await prisma.monitor.update({
      where: { id: monitor.id },
      data: { lastStatus: status },
    });
  }

  // Still running
  if (status === "running" || status === "pending") {
    return { monitorId: monitor.id, branch: monitor.branch, action: "skipped", detail: "Still running" };
  }

  // Canceled
  if (status === "canceled") {
    return { monitorId: monitor.id, branch: monitor.branch, action: "skipped", detail: "Canceled" };
  }

  // SUCCESS
  if (status === "success") {
    if (monitor.user.slackUserId) {
      const slackTs = await notifyPass(
        monitor.user.slackUserId,
        monitor.branch,
        monitor.prNumber
      );
      await prisma.notification.upsert({
        where: {
          monitorId_pipelineId_type: {
            monitorId: monitor.id,
            pipelineId: pipeline.id,
            type: "pass",
          },
        },
        update: {},
        create: {
          monitorId: monitor.id,
          pipelineId: pipeline.id,
          type: "pass",
          slackTs,
        },
      });
    }

    // Apply ready-to-merge label if flagged
    if (monitor.readyToMerge) {
      try {
        await addReadyToMergeLabel(monitor.prNumber);
      } catch (error) {
        console.error(`[CI Patrol] Failed to add ready-to-merge label to PR #${monitor.prNumber}:`, error);
      }
    }

    return { monitorId: monitor.id, branch: monitor.branch, action: "pass" };
  }

  // FAILED — check if we've exhausted reruns
  if (monitor.rerunCount >= monitor.maxReruns) {
    if (monitor.user.slackUserId) {
      const slackTs = await notifyLegitimateFailure(
        monitor.user.slackUserId,
        monitor.branch,
        monitor.prNumber,
        `Exhausted ${monitor.maxReruns} automatic reruns. Please investigate manually.`
      );
      await prisma.notification.upsert({
        where: {
          monitorId_pipelineId_type: {
            monitorId: monitor.id,
            pipelineId: pipeline.id,
            type: "legitimate_failure",
          },
        },
        update: {},
        create: {
          monitorId: monitor.id,
          pipelineId: pipeline.id,
          type: "legitimate_failure",
          slackTs,
        },
      });
    }
    return {
      monitorId: monitor.id,
      branch: monitor.branch,
      action: "notified_exhausted",
      detail: `Max reruns (${monitor.maxReruns}) reached`,
    };
  }

  // Analyze with Claude
  const failedJobDetails = await getFailedJobDetails(pipeline.id);

  if (failedJobDetails.length === 0) {
    return {
      monitorId: monitor.id,
      branch: monitor.branch,
      action: "skipped",
      detail: "Failed status but no failed jobs found",
    };
  }

  // Pick the first failed workflow for rerun
  const workflowId = failedJobDetails[0].workflowId;

  // Check if we already analyzed this specific workflow run.
  // Pipeline-level dedup is too broad because workflow reruns create
  // new failures under the same pipeline ID.
  const existingAnalysis = await prisma.analysis.findFirst({
    where: { monitorId: monitor.id, workflowId },
  });
  if (existingAnalysis) {
    return {
      monitorId: monitor.id,
      branch: monitor.branch,
      action: "skipped",
      detail: `Already analyzed workflow ${workflowId} (verdict: ${existingAnalysis.verdict})`,
    };
  }

  const prDiff = await fetchPRDiff(monitor.prNumber);

  const failures: TestFailureInfo[] = failedJobDetails.map((j) => ({
    jobName: j.jobName,
    failedTests: j.failedTests.map((t) => ({
      name: t.name,
      file: t.file,
      message: t.message,
    })),
  }));

  const analysis = await analyzeFailure(failures, prDiff);

  // Save analysis
  const savedAnalysis = await prisma.analysis.create({
    data: {
      monitorId: monitor.id,
      pipelineId: pipeline.id,
      workflowId,
      verdict: analysis.verdict,
      reasoning: analysis.reasoning,
      failedJobs: JSON.stringify(
        failedJobDetails.map((j) => ({
          jobName: j.jobName,
          failedTests: j.failedTests.map((t) => t.name),
        }))
      ),
      actionTaken: analysis.verdict === "flaky" ? "rerun" : "notified",
    },
  });

  // Record individual flaky specs for tracking
  const flakyTests = analysis.failedTests.filter((t) => t.classification === "flaky");
  if (flakyTests.length > 0) {
    // Build a map of test name → failure details from the raw job data
    const testDetails = new Map<string, { file: string; message: string; jobName: string }>();
    for (const job of failures) {
      for (const test of job.failedTests) {
        testDetails.set(test.name, { file: test.file, message: test.message, jobName: job.jobName });
      }
    }

    await prisma.flakySpec.createMany({
      data: flakyTests.map((t) => {
        const detail = testDetails.get(t.name);
        // Extract error class from message (e.g. "Net::ReadTimeout" from "Net::ReadTimeout: ...")
        const errorClassMatch = detail?.message.match(/^([A-Z][\w:]+(?:::[A-Z]\w+)*)/);
        return {
          analysisId: savedAnalysis.id,
          file: detail?.file ?? t.name,
          name: t.name,
          errorMessage: detail?.message.slice(0, 1000) ?? t.reason,
          errorClass: errorClassMatch?.[1] ?? null,
          jobName: detail?.jobName ?? "unknown",
          branch: monitor.branch,
          prNumber: monitor.prNumber,
          pipelineId: pipeline.id,
          workflowId,
        };
      }),
    });

    console.log(`[CI Patrol] Recorded ${flakyTests.length} flaky spec(s) for ${monitor.branch}`);
  }

  if (analysis.verdict === "flaky") {
    // Rerun from failed
    const didRerun = await rerunWorkflowFromFailed(workflowId);

    const newRerunCount = monitor.rerunCount + 1;
    await prisma.monitor.update({
      where: { id: monitor.id },
      data: {
        rerunCount: newRerunCount,
        // Mark as "running" so the next poll detects when the rerun finishes
        lastStatus: didRerun ? "running" : "failed",
      },
    });

    if (monitor.user.slackUserId) {
      const slackTs = await notifyFlakyRerun(
        monitor.user.slackUserId,
        monitor.branch,
        monitor.prNumber,
        analysis.reasoning,
        newRerunCount,
        monitor.maxReruns
      );
      await prisma.notification.upsert({
        where: {
          monitorId_pipelineId_type: {
            monitorId: monitor.id,
            pipelineId: pipeline.id,
            type: "flaky_rerun",
          },
        },
        update: {},
        create: {
          monitorId: monitor.id,
          pipelineId: pipeline.id,
          type: "flaky_rerun",
          slackTs,
        },
      });
    }

    return {
      monitorId: monitor.id,
      branch: monitor.branch,
      action: "rerun",
      detail: analysis.reasoning,
    };
  }

  // Legitimate or unclear — notify
  if (monitor.user.slackUserId) {
    const slackTs = await notifyLegitimateFailure(
      monitor.user.slackUserId,
      monitor.branch,
      monitor.prNumber,
      analysis.reasoning
    );
    await prisma.notification.upsert({
      where: {
        monitorId_pipelineId_type: {
          monitorId: monitor.id,
          pipelineId: pipeline.id,
          type: "legitimate_failure",
        },
      },
      update: {},
      create: {
        monitorId: monitor.id,
        pipelineId: pipeline.id,
        type: "legitimate_failure",
        slackTs,
      },
    });
  }

  return {
    monitorId: monitor.id,
    branch: monitor.branch,
    action: "notified_legitimate",
    detail: analysis.reasoning,
  };
}
