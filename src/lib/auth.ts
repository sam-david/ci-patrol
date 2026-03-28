import { cookies } from "next/headers";
import { prisma } from "./db";
import crypto from "crypto";

const SESSION_COOKIE = "ci-patrol-session";
const SECRET = process.env.SESSION_SECRET || "dev-secret";

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(value);
  return `${value}.${hmac.digest("base64url")}`;
}

function verify(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  if (sign(value) !== signed) return null;
  return value;
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sign(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie) return null;
  const userId = verify(cookie.value);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
