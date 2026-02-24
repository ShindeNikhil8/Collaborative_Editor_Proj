import { useEffect, useMemo, useState } from "react";
import { useNetworkStore } from "../../store/networkStore";
import { useAuthStore } from "../../store/authStore";
import type { Peer } from "../../types/global";

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 10_000) return "Just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function NetworkPanel() {
  const profile = useAuthStore((s) => s.profile);

  const peers = useNetworkStore((s) => s.peers);
  const connectingIps = useNetworkStore((s) => s.connectingIps);
  const loadPeers = useNetworkStore((s) => s.loadPeers);
  const bindPeerUpdates = useNetworkStore((s) => s.bindPeerUpdates);
  const connectToPeer = useNetworkStore((s) => s.connectToPeer);

  const [ip, setIp] = useState("");

  useEffect(() => {
    loadPeers();
    const unbind = bindPeerUpdates();
    return () => unbind();
  }, [loadPeers, bindPeerUpdates]);

  const grouped = useMemo(() => {
    const online: Peer[] = [];
    const offline: Peer[] = [];
    const connecting: Peer[] = [];

    for (const p of peers) {
      const isConnecting = !!connectingIps[p.ip];
      if (p.status === "online") online.push(p);
      else if (isConnecting || p.status === "connecting") connecting.push(p);
      else offline.push(p);
    }

    // sort within each group
    const byName = (a: Peer, b: Peer) => a.name.localeCompare(b.name);
    online.sort(byName);
    connecting.sort(byName);
    offline.sort(byName);

    return { online, connecting, offline };
  }, [peers, connectingIps]);

  const isInputConnecting = !!connectingIps[ip.trim()];

  return (
    <div className="panel">
      <h3>Network</h3>

      {/* My profile */}
      <div className="section">
        <div className="label">My profile</div>
        <div className="card">
          <div>
            <b>Name:</b> {profile?.name ?? "-"}
          </div>
          <div>
            <b>IP:</b> {profile?.ip ?? "-"}
          </div>
          <div>
            <b>Status:</b> Online
          </div>
        </div>
      </div>

      {/* Connect */}
      <div className="section">
        <div className="label">Connect to peer</div>
        <div className="row">
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="Peer Tailscale IP"
          />
          <button
            onClick={() => connectToPeer(ip)}
            disabled={!ip.trim() || isInputConnecting}
            title={isInputConnecting ? "Connecting..." : "Ping"}
          >
            {isInputConnecting ? "Connecting..." : "Ping"}
          </button>
        </div>
      </div>

      {/* Peer list */}
      <div className="section">
        <div className="label">Peers</div>

        {peers.length === 0 ? (
          <div className="card">No peers known yet</div>
        ) : (
          <>
            {/* ONLINE */}
            <div style={{ marginTop: 8, marginBottom: 6, fontWeight: 600 }}>
              Online ({grouped.online.length})
            </div>
            {grouped.online.length === 0 ? (
              <div className="card">No online peers</div>
            ) : (
              grouped.online.map((p) => <PeerCard key={p.userId} p={p} connecting={false} onConnect={connectToPeer} />)
            )}

            {/* CONNECTING */}
            <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 600 }}>
              Connecting ({grouped.connecting.length})
            </div>
            {grouped.connecting.length === 0 ? (
              <div className="card">No connections in progress</div>
            ) : (
              grouped.connecting.map((p) => (
                <PeerCard
                  key={p.userId}
                  p={p}
                  connecting={true}
                  onConnect={connectToPeer}
                />
              ))
            )}

            {/* OFFLINE */}
            <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 600 }}>
              Offline ({grouped.offline.length})
            </div>
            {grouped.offline.length === 0 ? (
              <div className="card">No offline peers</div>
            ) : (
              grouped.offline.map((p) => (
                <PeerCard
                  key={p.userId}
                  p={p}
                  connecting={!!connectingIps[p.ip]}
                  onConnect={connectToPeer}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );

  function PeerCard({
    p,
    connecting,
    onConnect,
  }: {
    p: Peer;
    connecting: boolean;
    onConnect: (ip: string) => Promise<void>;
  }) {
    const isActuallyConnecting = connecting || !!connectingIps[p.ip];

    return (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div>
              <b>{p.name}</b> ({p.ip})
            </div>

            <div>
              Status:{" "}
              {p.status === "online" ? "online" : isActuallyConnecting ? "connecting" : "offline"}
            </div>

            {p.discoveredVia && (
              <div style={{ fontSize: 12, color: "#666" }}>
                Added via: {p.discoveredVia.name} ({p.discoveredVia.ip})
              </div>
            )}

            <div style={{ fontSize: 12, color: "#666" }}>
              Last seen: {timeAgo(p.lastSeen)} ({new Date(p.lastSeen).toLocaleString()})
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <button
              onClick={() => onConnect(p.ip)}
              disabled={p.status === "online" || isActuallyConnecting}
              title={
                p.status === "online"
                  ? "Already online"
                  : isActuallyConnecting
                  ? "Connecting..."
                  : "Connect"
              }
            >
              {p.status === "online"
                ? "Online"
                : isActuallyConnecting
                ? "Connecting..."
                : "Connect"}
            </button>

            {/* ✅ ADD TEST MSG BUTTON HERE */}
            <button
              onClick={() => window.api.sendMsg(p.userId, `Hello from ${profile?.name ?? "me"}`)}
              disabled={p.status !== "online"}
              title={p.status !== "online" ? "Peer must be online" : "Send a test message"}
            >
              Test MSG
            </button>
          </div>
        </div>
      </div>
    );
  }
}