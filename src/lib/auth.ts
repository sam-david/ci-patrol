import { prisma } from "./db";
import { getCurrentUser } from "./github";

let cachedUserId: string | null = null;

/** Get or create the current user based on gh CLI auth */
export async function getSession() {
  // If we already know the user, fetch from DB
  if (cachedUserId) {
    const user = await prisma.user.findUnique({ where: { id: cachedUserId } });
    if (user) return user;
    cachedUserId = null;
  }

  // Detect user from gh CLI
  const ghUser = await getCurrentUser();

  const user = await prisma.user.upsert({
    where: { githubLogin: ghUser.login },
    update: { avatarUrl: ghUser.avatarUrl },
    create: {
      githubId: 0, // not needed for CLI auth
      githubLogin: ghUser.login,
      avatarUrl: ghUser.avatarUrl,
      accessToken: "", // not needed for CLI auth
    },
  });

  cachedUserId = user.id;
  return user;
}
