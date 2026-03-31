import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const monitor = await prisma.monitor.findFirst({
    where: { id, userId: user.id },
  });

  if (!monitor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: { maxReruns?: number; readyToMerge?: boolean } = {};
  if (typeof body.maxReruns === "number" && body.maxReruns >= 1 && body.maxReruns <= 10) {
    updateData.maxReruns = body.maxReruns;
  }
  if (typeof body.readyToMerge === "boolean") {
    updateData.readyToMerge = body.readyToMerge;
  }

  const updated = await prisma.monitor.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ monitor: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const monitor = await prisma.monitor.findFirst({
    where: { id, userId: user.id },
  });

  if (!monitor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.monitor.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}
