import { NextRequest, NextResponse } from "next/server";
import { runPollCycle } from "@/lib/monitor";

export async function POST(request: NextRequest) {
  // Verify poll secret (for cron security)
  const authHeader = request.headers.get("authorization");
  const pollSecret = process.env.POLL_SECRET;

  if (pollSecret && authHeader !== `Bearer ${pollSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runPollCycle();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    monitorsProcessed: results.length,
    results,
  });
}

// Also support GET for easy testing in browser during development
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return POST(request);
}
