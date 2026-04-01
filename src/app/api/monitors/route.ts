import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processMonitorById } from "@/lib/monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monitors = await prisma.monitor.findMany({
    where: { userId: user.id, active: true },
    include: {
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ monitors });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { branch, prNumber, prTitle } = body;

  if (!branch || !prNumber || !prTitle) {
    return NextResponse.json(
      { error: "branch, prNumber, and prTitle are required" },
      { status: 400 }
    );
  }

  const monitor = await prisma.monitor.upsert({
    where: {
      userId_branch: { userId: user.id, branch },
    },
    update: {
      active: true,
      prNumber,
      prTitle,
      rerunCount: 0,
      lastPipelineId: null,
      lastStatus: null,
    },
    create: {
      userId: user.id,
      branch,
      prNumber,
      prTitle,
    },
  });

  // Clear old data so this is a fresh start.
  // Delete flaky specs first (FK → analysis), then analyses, then notifications.
  const analysisIds = (
    await prisma.analysis.findMany({
      where: { monitorId: monitor.id },
      select: { id: true },
    })
  ).map((a) => a.id);
  if (analysisIds.length > 0) {
    await prisma.flakySpec.deleteMany({ where: { analysisId: { in: analysisIds } } });
  }
  await prisma.analysis.deleteMany({ where: { monitorId: monitor.id } });
  await prisma.notification.deleteMany({ where: { monitorId: monitor.id } });

  // Immediately check this monitor's CI status
  processMonitorById(monitor.id)
    .then((result) => {
      console.log(`[CI Patrol] Initial check for ${branch}:`, result);
    })
    .catch((error) => {
      console.error(`[CI Patrol] Initial check failed for ${branch}:`, error);
    });

  return NextResponse.json({ monitor }, { status: 201 });
}
