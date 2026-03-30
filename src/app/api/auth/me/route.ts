import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSession();
    return NextResponse.json({
      user: {
        id: user.id,
        githubLogin: user.githubLogin,
        avatarUrl: user.avatarUrl,
        slackUserId: user.slackUserId,
      },
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { user: null, error: "Not authenticated. Is `gh` CLI logged in?" },
      { status: 401 }
    );
  }
}
