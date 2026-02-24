import { useState } from "react";
import { useAuthStore } from "../store/authStore";

export default function Register() {
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ip, setIp] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await register({ name, email, ip });
  };

  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: 520, border: "1px solid #ddd", borderRadius: 12, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Register</h2>
        <p style={{ color: "#555" }}>
          Register once. Next time the app opens, you’ll be logged in automatically.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g., Ram)"
            required
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (e.g., ram@gmail.com)"
            type="email"
            required
          />
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="Tailscale IP (e.g., 100.x.x.x)"
            required
          />

          {error && <div style={{ color: "crimson" }}>{error}</div>}

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Registering..." : "Register"}
          </button>
        </form>

        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          Tip: You can get your Tailscale IP from the Tailscale app → Machines.
        </div>
      </div>
    </div>
  );
}