"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadOutbox = loadOutbox;
exports.upsertOutbox = upsertOutbox;
exports.removeOutbox = removeOutbox;
const electron_store_1 = __importDefault(require("electron-store"));
const store = new electron_store_1.default({ name: "distributed-editor" });
function loadOutbox() {
    return store.get("outbox") ?? [];
}
function saveOutbox(list) {
    store.set("outbox", list);
}
function upsertOutbox(msg) {
    const list = loadOutbox();
    const idx = list.findIndex((m) => m.msgId === msg.msgId);
    if (idx >= 0)
        list[idx] = msg;
    else
        list.push(msg);
    saveOutbox(list);
}
function removeOutbox(msgId) {
    saveOutbox(loadOutbox().filter((m) => m.msgId !== msgId));
}
