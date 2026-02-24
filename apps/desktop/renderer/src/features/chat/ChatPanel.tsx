import { useEffect, useMemo, useState } from "react";
import { useMessageStore } from "../../store/messageStore";
import { useNetworkStore } from "../../store/networkStore";
import type { Peer } from "../../types/global";
import type { UiMessage } from "../../types/global";

function statusLabel(m: UiMessage) {
  if (m.direction !== "out") return "";
  if (m.payload.scope === "PUBLIC" && m.progress) {
    const { delivered, total } = m.progress;
    if (m.status === "failed") return "Failed";
    return `Delivered ${delivered}/${total}`;
  }
  if (m.status === "queued") return "Queued";
  if (m.status === "sent") return "Sent";
  if (m.status === "delivered") return "Delivered";
  if (m.status === "failed") return "Failed";
  return "";
}

export default function ChatPanel() {
  const activeTab = useMessageStore((s) => s.activeTab);
  const setTab = useMessageStore((s) => s.setTab);
  const activeDmUserId = useMessageStore((s) => s.activeDmUserId);
  const setActiveDm = useMessageStore((s) => s.setActiveDm);

  const messages = useMessageStore((s) => s.messages);
  const bindIncoming = useMessageStore((s) => s.bindIncoming);
  const bindStatus = useMessageStore((s) => s.bindStatus);

  const addOutgoingDM = useMessageStore((s) => s.addOutgoingDM);
  const addOutgoingPublic = useMessageStore((s) => s.addOutgoingPublic);

  const peers = useNetworkStore((s) => s.peers);
  const loadPeers = useNetworkStore((s) => s.loadPeers);
  const bindPeerUpdates = useNetworkStore((s) => s.bindPeerUpdates);

  const [text, setText] = useState("");

  useEffect(() => {
    const un1 = bindIncoming();
    const un2 = bindStatus();
    return () => {
      un1();
      un2();
    };
  }, [bindIncoming, bindStatus]);

  useEffect(() => {
    loadPeers();
    const un = bindPeerUpdates();
    return () => un();
  }, [loadPeers, bindPeerUpdates]);

  const onlinePeers = useMemo(() => peers.filter((p) => p.status === "online"), [peers]);

  const threadKey = activeTab === "public"
    ? "public"
    : activeDmUserId
      ? `dm:${activeDmUserId}`
      : "dm:none";

  const threadMessages = useMemo(
    () => messages.filter((m) => m.threadKey === threadKey).slice().reverse(),
    [messages, threadKey]
  );

  async function send() {
    const msg = text.trim();
    if (!msg) return;

    if (activeTab === "public") {
      const groupId = await window.api.sendPublic(msg);
      // total recipients = all known peers except me (backend does it),
      // but in UI we show online count as approximation for now:
      addOutgoingPublic(msg, groupId, Math.max(onlinePeers.length, 0));
      setText("");
      return;
    }

    // private
    if (!activeDmUserId) {
      alert("Select a person in Private tab first.");
      return;
    }

    const msgId = await window.api.sendDM(activeDmUserId, msg);
    addOutgoingDM(activeDmUserId, msg, msgId);
    setText("");
  }

  return (
    <div className="panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setTab("public")}
          style={{ fontWeight: activeTab === "public" ? 700 : 400 }}
        >
          Public
        </button>
        <button
          onClick={() => setTab("private")}
          style={{ fontWeight: activeTab === "private" ? 700 : 400 }}
        >
          Private
        </button>
      </div>

      {/* Private peer list */}
      {activeTab === "private" && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Online members</div>
          {onlinePeers.length === 0 ? (
            <div className="card">No online peers</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {onlinePeers.map((p: Peer) => (
                <button
                  key={p.userId}
                  onClick={() => setActiveDm(p.userId)}
                  style={{
                    textAlign: "left",
                    fontWeight: activeDmUserId === p.userId ? 700 : 400,
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div style={{ flex: 1, overflow: "auto", marginTop: 12, display: "grid", gap: 8 }}>
        {threadKey === "dm:none" ? (
          <div className="card">Select a user to start private chat.</div>
        ) : threadMessages.length === 0 ? (
          <div className="card">No messages yet</div>
        ) : (
          threadMessages.map((m) => (
            <div key={m.msgId} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <b>{m.from.name}</b> {m.direction === "out" ? "(you)" : ""}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {new Date(m.ts).toLocaleTimeString()}
                </div>
              </div>

              <div style={{ marginTop: 6 }}>{m.payload.text}</div>

              {m.direction === "out" && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                  {statusLabel(m)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={activeTab === "public" ? "Message #public..." : "Message user..."}
          disabled={activeTab === "private" && !activeDmUserId}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button onClick={send} disabled={!text.trim() || (activeTab === "private" && !activeDmUserId)}>
          Send
        </button>
      </div>
    </div>
  );
}