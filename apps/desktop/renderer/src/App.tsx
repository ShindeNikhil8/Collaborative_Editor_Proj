import { useEffect } from "react";
import "./App.css";
import { useAuthStore } from "./store/authStore";
import Register from "./app/Register";
import Workspace from "./app/Workspace";

export default function App() {
  const { profile, isLoading, loadProfile } = useAuthStore();

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (isLoading) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center" }}>
        Loading...
      </div>
    );
  }

  return profile ? <Workspace /> : <Register />;
}