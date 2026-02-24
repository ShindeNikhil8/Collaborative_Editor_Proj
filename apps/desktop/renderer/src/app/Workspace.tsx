import { useState } from "react";
import NetworkPanel from "../features/network/NetworkPanel";
import MessageConsole from "../features/chat/MessageConsole";

type LeftTab = "explorer" | "network" | null;

export default function Workspace() {
  const [leftTab, setLeftTab] = useState<LeftTab>("network");

  return (
    <div className="app">
      {/* TOP BAR */}
      <div className="topbar">
        <div className="brand">DistributedEditor</div>
      </div>

      <div className="body">
        {/* LEFT ACTIVITY BAR */}
        <div className="left-activity">
          <button
            className={"icon" + (leftTab === "explorer" ? " active" : "")}
            onClick={() =>
              setLeftTab(leftTab === "explorer" ? null : "explorer")
            }
            title="Explorer"
          >
            📁
          </button>

          <button
            className={"icon" + (leftTab === "network" ? " active" : "")}
            onClick={() =>
              setLeftTab(leftTab === "network" ? null : "network")
            }
            title="Network"
          >
            🌐
          </button>
        </div>

        {/* LEFT OVERLAY PANEL (THIS IS WHERE NETWORKPANEL GOES) */}
        {leftTab && (
          <div className="left-overlay">
            {leftTab === "network" && <NetworkPanel />}
            {leftTab === "explorer" && (
              <div className="panel">Explorer UI later</div>
            )}
          </div>
        )}

        {/* EDITOR CENTER */}
        <div className="editor">
          <h2>Editor Area</h2>
        </div>

        {/* RIGHT CHAT PANEL */}
        <div className="right-panel">
          <MessageConsole />
        </div>
      </div>
    </div>
  );
}