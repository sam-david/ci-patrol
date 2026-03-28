"use client";

import Link from "next/link";

interface NavProps {
  user: {
    githubLogin: string;
    avatarUrl: string | null;
  };
}

export function Nav({ user }: NavProps) {
  return (
    <nav className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-white">
          CI Patrol
        </Link>
        <Link
          href="/history"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          History
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">{user.githubLogin}</span>
        {user.avatarUrl && (
          <img
            src={user.avatarUrl}
            alt={user.githubLogin}
            className="w-8 h-8 rounded-full"
          />
        )}
      </div>
    </nav>
  );
}
