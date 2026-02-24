import ElectronStore from "electron-store";
import { randomUUID } from "crypto";

export type UserProfile = {
  userId: string;
  name: string;
  email: string;
  ip: string;
  createdAt: number;
};

type Schema = {
  profile?: UserProfile;
};

const store = new ElectronStore<Schema>({
  name: "distributed-editor",
});

export function getProfile(): UserProfile | null {
  return store.get("profile") ?? null;
}

export function saveProfile(input: Omit<UserProfile, "userId" | "createdAt">): UserProfile {
  const existing = store.get("profile");

  const profile: UserProfile = {
    userId: existing?.userId ?? randomUUID(),
    createdAt: existing?.createdAt ?? Date.now(),
    ...input,
  };

  store.set("profile", profile);
  return profile;
}

export function clearProfile(): void {
  // electron-store supports delete(key)
  store.delete("profile");
}