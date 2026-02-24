import { useEffect, useMemo, useState } from "react";
import { useMessageStore } from "../../store/messageStore";
import { useNetworkStore } from "../../store/networkStore";
import { useAuthStore } from "../../store/authStore";
import type { UiMessage } from "../../types/global";

export default function MessageConsole() {
  const profile = useAuthStore((s) => s.profile);

  const peers = useNetworkStore((s) => s.peers);
  const loadPeers = useNetworkStore((s) => s.loadPeers);
  const bindPeerUpdates = useNetworkStore((s) => s.bindPeerUpdates);

  const messages = useMessageStore((s) => s.messages);
  const bindIncoming = useMessageStore((s) => s.bindIncoming);
  const addLocal = useMessageStore((s) => s.addLocal);
  const clear = useMessageStore((s) => s.clear);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [text, setText] = useState("");

  // keep peers list live
  useEffect(() => {
    loadPeers();
    const unbindPeers = bindPeerUpdates();
    return () => unbindPeers();
  }, [loadPeers, bindPeerUpdates]);

  // bind incoming msg event
  useEffect(() => {
    const unbind = bindIncoming();
    return () => unbind();
  }, [bindIncoming]);

  // only allow chat to online peers for now
  const onlinePeers = useMemo(
    () => peers.filter((p) => p.status === "online"),
    [peers]
  );

  const selectedPeer =
    onlinePeers.find((p) => p.userId === selectedUserId) ?? null;

  async function send() {
    const msg = text.trim();
    if (!msg) return;

    if (!selectedUserId) {
      alert("Select a peer first");
      return;
    }

    // send to backend
    await window.api.sendMsg(selectedUserId, msg);

    // local echo so sender also sees it instantly
    const localMsg: UiMessage = {
      msgId: `local-${Date.now()}`,
      from: {
        userId: profile?.userId ?? "me",
        name: profile?.name ?? "Me",
        ip: profile?.ip ?? "-",
      },
      ts: Date.now(),
      payload: { kind: "CHAT", text: msg },
    };
    addLocal(localMsg);

    setText("");
  }

  return (
    <div className="panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0 }}>Messages</h3>
        <button onClick={clear}>Clear</button>
      </div>

      {/* Peer select */}
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#666" }}>
          Send private message to:
        </div>

        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">-- Select online peer --</option>
          {onlinePeers.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name} ({p.ip})
            </option>
          ))}
        </select>

        {/* Input */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              selectedPeer
                ? `Message ${selectedPeer.name}...`
                : "Select a peer to message"
            }
            disabled={!selectedPeer}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button onClick={send} disabled={!selectedPeer || !text.trim()}>
            Send
          </button>
        </div>
      </div>

      {/* Messages list */}
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {messages.length === 0 ? (
          <div className="card">No messages yet</div>
        ) : (
          messages.map((m) => (
            <div key={m.msgId} className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <b>{m.from.name}</b>
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {new Date(m.ts).toLocaleTimeString()}
                </div>
              </div>

              <div style={{ marginTop: 6 }}>{m.payload.text}</div>

              {m.payload.kind !== "CHAT" && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                  Kind: {m.payload.kind}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}