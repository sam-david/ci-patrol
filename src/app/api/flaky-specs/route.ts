import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Top flaky specs by occurrence count
  const allFlakes = await prisma.flakySpec.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Aggregate by file
  const byFile = new Map<
    string,
    {
      file: string;
      count: number;
      lastSeen: string;
      errorClasses: Set<string>;
      jobNames: Set<string>;
      branches: Set<string>;
      recentErrors: string[];
    }
  >();

  for (const flake of allFlakes) {
    const existing = byFile.get(flake.file);
    if (existing) {
      existing.count++;
      if (flake.errorClass) existing.errorClasses.add(flake.errorClass);
      existing.jobNames.add(flake.jobName);
      existing.branches.add(flake.branch);
      if (existing.recentErrors.length < 3) {
        existing.recentErrors.push(flake.errorMessage);
      }
    } else {
      byFile.set(flake.file, {
        file: flake.file,
        count: 1,
        lastSeen: flake.createdAt.toISOString(),
        errorClasses: new Set(flake.errorClass ? [flake.errorClass] : []),
        jobNames: new Set([flake.jobName]),
        branches: new Set([flake.branch]),
        recentErrors: [flake.errorMessage],
      });
    }
  }

  // Sort by count descending
  const topFlakers = Array.from(byFile.values())
    .map((f) => ({
      file: f.file,
      count: f.count,
      lastSeen: f.lastSeen,
      errorClasses: Array.from(f.errorClasses),
      jobNames: Array.from(f.jobNames),
      branches: Array.from(f.branches),
      recentErrors: f.recentErrors,
    }))
    .sort((a, b) => b.count - a.count);

  // Recent flakes (last 50)
  const recentFlakes = allFlakes.slice(0, 50).map((f) => ({
    id: f.id,
    file: f.file,
    name: f.name,
    errorMessage: f.errorMessage,
    errorClass: f.errorClass,
    jobName: f.jobName,
    branch: f.branch,
    prNumber: f.prNumber,
    createdAt: f.createdAt.toISOString(),
  }));

  // Summary stats
  const totalFlakes = allFlakes.length;
  const uniqueSpecs = byFile.size;
  const uniqueErrorClasses = new Set(
    allFlakes.map((f) => f.errorClass).filter(Boolean)
  ).size;

  return NextResponse.json({
    summary: { totalFlakes, uniqueSpecs, uniqueErrorClasses },
    topFlakers,
    recentFlakes,
  });
}
