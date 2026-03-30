import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchOpenPRs } from "@/lib/github";
import { getPipelinesForBranches, getPipelineStatus } from "@/lib/circleci";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
