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

  // Run the monitoring poll cycle in the background on every refresh.
  // This piggybacks on the frontend's 15-second SWR polling so we don't
  // need a separate persistent process for background work.
  runPollCycle().catch((error) => {
    console.error("[CI Patrol] Poll cycle error:", error);
  });

  const prs = await fetchOpenPRs(user.githubLogin);
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
