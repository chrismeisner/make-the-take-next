//components/modals/ChangeUsernameModal.js

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import GlobalModal from "./GlobalModal";

export default function ChangeUsernameModal({ isOpen, onClose, currentUsername }) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [username, setUsername] = useState(currentUsername || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(currentUsername || "");
  }, [currentUsername]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const trimmed = (username || "").trim();
    if (!trimmed.match(/^[a-zA-Z0-9_]{3,20}$/)) {
      setError("Username must be 3–20 chars: letters, numbers, or underscores.");
      return;
    }
    if (trimmed.toLowerCase() === (currentUsername || "").toLowerCase()) {
      setError("That is already your username.");
      return;
    }
    try {
      setSaving(true);
      const resp = await fetch("/api/profile/updateUsername", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || "Failed to update username");
      }
      // Refresh session so header/profile links reflect the new handle immediately
      try { await update({ profileID: trimmed }); } catch {}
      // Navigate to the new profile route
      try {
        const newPath = `/profile/${encodeURIComponent(trimmed)}`;
        // If currently on a profile page, replace so back button feels natural
        if (router?.pathname?.startsWith("/profile/")) {
          await router.replace(newPath);
        } else {
          await router.push(newPath);
        }
      } catch (_) {}
      onClose && onClose();
    } catch (err) {
      try { console.error("[ChangeUsernameModal]", err); } catch {}
      setError(err?.message || "Could not update username");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h3 className="text-lg font-bold mb-2">Change username</h3>
      <p className="text-sm text-gray-600 mb-3">
        Your username is how others find you. It must be unique.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            New username
          </label>
          <input
            id="username"
            type="text"
            className="w-full border rounded px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. sports_fan_23"
            autoFocus
          />
        </div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-1 border rounded text-gray-700 hover:bg-gray-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </GlobalModal>
  );
}


