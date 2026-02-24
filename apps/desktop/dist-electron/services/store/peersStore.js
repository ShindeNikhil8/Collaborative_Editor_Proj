"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadKnownPeers = loadKnownPeers;
exports.saveKnownPeers = saveKnownPeers;
const electron_store_1 = __importDefault(require("electron-store"));
const store = new electron_store_1.default({ name: "distributed-editor" });
function loadKnownPeers() {
    return store.get("peers") ?? [];
}
function saveKnownPeers(peers) {
    store.set("peers", peers);
}
