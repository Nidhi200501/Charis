export type StoredUser = { id?: number; name?: string; email: string; provider?: string };

export function getStoredUser(): StoredUser | null {
  try {
    const value = window.localStorage.getItem("charis_user");
    return value ? JSON.parse(value) as StoredUser : null;
  } catch {
    return null;
  }
}

export function accountStorageKey(name: string): string {
  const userId = getStoredUser()?.id;
  return `charis:${userId ? `user:${userId}` : "guest"}:${name}`;
}
