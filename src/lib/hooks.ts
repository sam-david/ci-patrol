import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) return null;
    return r.json();
  });

export function useUser() {
  const { data, error, isLoading, mutate } = useSWR("/api/auth/me", fetcher);
  return {
    user: data?.user ?? null,
    isLoading,
    error,
    mutate,
  };
}
