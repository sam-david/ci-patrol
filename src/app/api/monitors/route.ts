import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  return NextResponse.json({ monitor }, { status: 201 });
}
