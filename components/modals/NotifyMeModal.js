import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import GlobalModal from "./GlobalModal";

export default function NotifyMeModal({ isOpen, onClose, packTitle, packURL }) {
  const { data: session } = useSession();
  const [status, setStatus] = useState("idle"); // idle | submitting | success | already
  const [error, setError] = useState("");

  useEffect(() => {
    let aborted = false;
    async function subscribe() {
      if (!isOpen) return;
      if (!session?.user || !packURL) return;
      setStatus("submitting");
      setError("");
      try {
        const resp = await fetch("/api/packs/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packURL }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) {
          throw new Error(data.error || "Failed to subscribe");
        }
        if (aborted) return;
        setStatus(data.alreadySubscribed ? "already" : "success");
      } catch (e) {
        if (aborted) return;
        setError(e?.message || "Failed to subscribe");
        setStatus("idle");
      }
    }
    subscribe();
    return () => { aborted = true; };
  }, [isOpen, session, packURL]);

  const loggedOut = !session?.user;

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-bold mb-2">Notify me</h2>
      <p className="text-sm text-gray-700 mb-4">
        Notify me when this pack drops{packTitle ? `: ${packTitle}` : ""}.
      </p>

      {loggedOut ? (
        <div>
          <p className="text-sm text-gray-800">Log in to be added to the notification list for this pack.</p>
          <div className="mt-4 flex gap-2">
            <a
              href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Log in
            </a>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-200 text-gray-900 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {status === "submitting" && (
            <p className="text-sm text-gray-800">Adding you to the list…</p>
          )}
          {status === "success" && (
            <p className="text-green-700 text-sm">You're on the list! We'll text you when it drops.</p>
          )}
          {status === "already" && (
            <p className="text-green-700 text-sm">You're already on the list for this pack.</p>
          )}
          {error && (
            <p className="text-red-700 text-sm">{error}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </GlobalModal>
  );
}


