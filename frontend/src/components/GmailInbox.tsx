import React, { useEffect, useState } from "react";
import { Lock, Mail, Loader2, LogOut, AlertTriangle } from "lucide-react";

interface GmailMessage {
  id: string;
  snippet: string;
  headers: { name: string; value: string }[];
}

export const GmailInbox: React.FC = () => {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [status, setStatus] = useState("");
  const [authStep, setAuthStep] = useState<"none" | "authorized">("none");
  const [loading, setLoading] = useState(false);

  // === Check if user already authorized ===
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await window.electronAPI.invoke("gmail-check-auth");
        if (res?.authorized) {
          setAuthStep("authorized");
          setStatus("✅ Already signed in.");
          await fetchInbox();
        } else {
          setAuthStep("none");
        }
      } catch {
        setAuthStep("none");
      }
    };
    checkAuth();
  }, []);

  // === Start OAuth (now auto-handled by main via loopback redirect)
  const startAuth = async () => {
    setStatus("🌐 Opening Google sign-in...");
    setLoading(true);
    try {
      const res = await window.electronAPI.invoke("gmail-auth");
      if (!res.success) {
        setStatus("❌ Sign-in failed: " + res.error);
        setAuthStep("none");
        setLoading(false);
        return;
      }

      // Wait 3s, then check token storage
      setStatus("✅ Waiting for authorization to complete...");
      await new Promise((r) => setTimeout(r, 3000));
      const check = await window.electronAPI.invoke("gmail-check-auth");

      if (check.authorized) {
        setAuthStep("authorized");
        setStatus("✅ Signed in successfully!");
        fetchInbox();
      } else {
        setStatus("⚠️ Sign-in may not have completed. Please try again.");
        setAuthStep("none");
      }
    } catch (err: any) {
      setStatus("❌ Error during sign-in: " + err.message);
      setAuthStep("none");
    } finally {
      setLoading(false);
    }
  };

  // === Fetch Inbox ===
  const fetchInbox = async () => {
    setLoading(true);
    setStatus("📬 Fetching inbox...");
    const res = await window.electronAPI.invoke("gmail-list", 25);
    setLoading(false);

    if (!res.success) {
      setStatus("❌ " + res.error);
      if (res.error?.includes("sign in") || res.error?.includes("token")) {
        setAuthStep("none");
      }
      return;
    }

    setMessages(res.messages || []);
    setStatus(`✅ Loaded ${res.messages?.length || 0} messages`);
  };

  // === Sign out ===
  const signOut = async () => {
    await window.electronAPI.invoke("gmail-signout");
    setMessages([]);
    setAuthStep("none");
    setStatus("👋 Signed out");
  };

  // === UI ===
  return (
    <div className="flex flex-col flex-1 h-full px-6 py-5 bg-[#191919] text-gray-200 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="text-blue-400" size={22} />
          <h1 className="text-lg font-semibold">Gmail Inbox</h1>
        </div>
        {loading && <Loader2 size={18} className="animate-spin text-gray-400" />}
      </div>

      {/* === Not Authenticated === */}
      {authStep === "none" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Lock className="text-yellow-500 mb-4" size={40} />
          <h2 className="text-lg font-semibold mb-2">You're not logged in</h2>
          <p className="text-sm text-gray-400 mb-6">
            Sign in to connect your Gmail account and view your messages.
          </p>

          <button
            onClick={startAuth}
            disabled={loading}
            className={`px-5 py-2.5 rounded-md font-medium shadow-md transition ${
              loading
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {loading ? "Opening..." : "Sign in with Google"}
          </button>

          {status && (
            <p className="text-xs text-gray-500 mt-4 max-w-xs leading-snug">{status}</p>
          )}
        </div>
      )}

      {/* === Authorized === */}
      {authStep === "authorized" && (
        <>
          <div className="flex gap-3 mb-3">
            <button
              onClick={fetchInbox}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md font-medium"
            >
              Refresh Inbox
            </button>
            <button
              onClick={signOut}
              className="border border-gray-500 hover:bg-red-600 px-4 py-2 rounded-md font-medium flex items-center gap-1"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>

          {status && <div className="text-sm text-gray-400 mb-3">{status}</div>}

          {messages.length > 0 ? (
            <div className="flex-1 overflow-y-auto mt-2 space-y-3">
              {messages.map((msg) => {
                const from =
                  msg.headers.find((h) => h.name === "From")?.value ?? "Unknown Sender";
                const subject =
                  msg.headers.find((h) => h.name === "Subject")?.value ?? "(No Subject)";
                const date =
                  msg.headers.find((h) => h.name === "Date")?.value ?? "";
                return (
                  <div
                    key={msg.id}
                    className="bg-[#232323] hover:bg-[#2e2e2e] transition rounded-lg p-3 border border-gray-700"
                  >
                    <div className="font-medium text-blue-400 truncate">{subject}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {from} • {date}
                    </div>
                    <p className="text-sm text-gray-300 mt-2 line-clamp-2">
                      {msg.snippet}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            !loading && (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                <Mail className="mb-2 text-gray-600" size={32} />
                <p>No messages to display</p>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};
