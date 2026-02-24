"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = getProfile;
exports.saveProfile = saveProfile;
exports.clearProfile = clearProfile;
const electron_store_1 = __importDefault(require("electron-store"));
const crypto_1 = require("crypto");
const store = new electron_store_1.default({
    name: "distributed-editor",
});
function getProfile() {
    return store.get("profile") ?? null;
}
function saveProfile(input) {
    const existing = store.get("profile");
    const profile = {
        userId: existing?.userId ?? (0, crypto_1.randomUUID)(),
        createdAt: existing?.createdAt ?? Date.now(),
        ...input,
    };
    store.set("profile", profile);
    return profile;
}
function clearProfile() {
    // electron-store supports delete(key)
    store.delete("profile");
}
