import ElectronStore from "electron-store";
import { randomUUID } from "crypto";

export type UserProfile = {
  userId: string;
  name: string;
  email: string;
  ip: string;
  createdAt: number;
};

type Schema = { profile?: UserProfile };

const store = new ElectronStore<Schema>({ name: "distributed-editor" });

export function getProfile(): UserProfile | null {
  return store.get("profile") ?? null;
}

export function saveProfile(p: { name: string; email: string; ip: string }): UserProfile {
  const existing = getProfile();

  const next: UserProfile = {
    userId: existing?.userId ?? randomUUID(),     // ✅ stable forever
    createdAt: existing?.createdAt ?? Date.now(), // ✅ stable forever
    name: p.name,
    email: p.email,
    ip: p.ip,
  };

  store.set("profile", next);
  return next;
}

export function clearProfile() {
  store.delete("profile");
}