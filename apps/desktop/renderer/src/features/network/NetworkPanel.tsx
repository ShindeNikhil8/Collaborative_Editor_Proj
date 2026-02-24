import { useEffect, useState } from "react";
import { useNetworkStore } from "../../store/networkStore";
import { useAuthStore } from "../../store/authStore";

export default function NetworkPanel() {
  const profile = useAuthStore((s) => s.profile);
  const peers = useNetworkStore((s) => s.peers);
  const loadPeers = useNetworkStore((s) => s.loadPeers);
  const bindPeerUpdates = useNetworkStore((s) => s.bindPeerUpdates);
  const connectToPeer = useNetworkStore((s) => s.connectToPeer);

  const [ip, setIp] = useState("");

  useEffect(() => {
    loadPeers();
    const unbind = bindPeerUpdates();
    return () => unbind();
  }, [loadPeers, bindPeerUpdates]);

  return (
    <div className="panel">
      <h3>Network</h3>

      {/* My profile */}
      <div className="section">
        <div className="label">My profile</div>
        <div className="card">
          <div><b>Name:</b> {profile?.name}</div>
          <div><b>IP:</b> {profile?.ip}</div>
          <div><b>Status:</b> Online</div>
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
          <button onClick={() => connectToPeer(ip)}>Ping</button>
        </div>
      </div>

      {/* Peer list */}
      <div className="section">
        <div className="label">Peers</div>

        {peers.length === 0 ? (
          <div className="card">No peers connected</div>
        ) : (
          peers.map((p) => (
            <div key={p.userId} className="card">
              <div>
                <b>{p.name}</b> ({p.ip})
              </div>

              <div>Status: {p.status}</div>

              {/* 👇 ADD THIS BLOCK HERE */}
              {p.discoveredVia && (
                <div style={{ fontSize: 12, color: "#666" }}>
                  Added via: {p.discoveredVia.name} ({p.discoveredVia.ip})
                </div>
              )}

              <div style={{ fontSize: 12, color: "#666" }}>
                Last seen: {new Date(p.lastSeen).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}