"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadChatHistory = loadChatHistory;
exports.appendChatMessage = appendChatMessage;
exports.clearChatHistory = clearChatHistory;
const electron_store_1 = __importDefault(require("electron-store"));
const store = new electron_store_1.default({ name: "distributed-editor" });
function loadChatHistory() {
    return store.get("chatHistory") ?? [];
}
function appendChatMessage(m) {
    const list = loadChatHistory();
    if (list.some((x) => x.msgId === m.msgId))
        return;
    list.push(m);
    store.set("chatHistory", list.slice(-1500));
}
function clearChatHistory() {
    store.set("chatHistory", []);
}
