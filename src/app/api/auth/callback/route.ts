import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("oauth-state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      new URL("/?error=auth_failed", request.url)
    );
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return NextResponse.redirect(
      new URL("/?error=token_failed", request.url)
    );
  }

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const githubUser = await userRes.json();

  // Upsert user
  const user = await prisma.user.upsert({
    where: { githubId: githubUser.id },
    update: {
      githubLogin: githubUser.login,
      avatarUrl: githubUser.avatar_url,
      accessToken: tokenData.access_token,
    },
    create: {
      githubId: githubUser.id,
      githubLogin: githubUser.login,
      avatarUrl: githubUser.avatar_url,
      accessToken: tokenData.access_token,
    },
  });

  await createSession(user.id);

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("oauth-state");
  return response;
}
