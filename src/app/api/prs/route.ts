import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchOpenPRs } from "@/lib/github";
import { getPipelinesForBranches, getPipelineStatus } from "@/lib/circleci";
import { runPollCycle } from "@/lib/monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run PR fetch and poll cycle concurrently.
  // The poll cycle must complete within this request — fire-and-forget
  // gets killed by Next.js when the response is sent.
  const [prs, pollResults] = await Promise.all([
    fetchOpenPRs(user.githubLogin),
    runPollCycle().catch((error) => {
      console.error("[CI Patrol] Poll cycle error:", error);
      return [];
    }),
  ]);

  if (pollResults.length > 0) {
    const active = pollResults.filter((r) => r.action !== "skipped");
    if (active.length > 0) {
      console.log("[CI Patrol] Poll actions:", active);
    }
  }

  const branches = prs.map((pr) => pr.branch);

  // Fetch CI status for all branches in parallel
  const pipelines = await getPipelinesForBranches(branches);

  const prsWithStatus = await Promise.all(
    prs.map(async (pr) => {
      const pipeline = pipelines.get(pr.branch);
      let ciStatus: string | null = null;

      if (pipeline) {
        ciStatus = await getPipelineStatus(pipeline.id);
      }

      return {
        ...pr,
        ciStatus,
        pipelineId: pipeline?.id ?? null,
      };
    })
  );

  return NextResponse.json({ prs: prsWithStatus });
}
