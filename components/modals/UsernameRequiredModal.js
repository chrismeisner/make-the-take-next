import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import GlobalModal from "./GlobalModal";
import { useModal } from "../../contexts/ModalContext";

export default function UsernameRequiredModal({ isOpen, onClose, receiptId, packTitle, submitAllTakes, profileID }) {
  const { openModal } = useModal();
  const { data: session } = useSession();

  // Compute a default temporary username: 'taker' + last 4 digits of phone
  const phone = session?.user?.phone || "";
  const numericPhone = phone.replace(/\D/g, "");
  const last4 = numericPhone.length >= 4 ? numericPhone.slice(-4) : numericPhone;
  const defaultUsername = numericPhone ? `taker${last4}` : "";

  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Prefill the username once when defaultUsername becomes available
  useEffect(() => {
    if (username === "" && defaultUsername) {
      setUsername(defaultUsername);
    }
  }, [defaultUsername]);

  const handleSubmitUsername = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }
    setIsLoading(true);
    try {
      const resp = await fetch("/api/profile/updateUsername", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileID, username }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || "Failed to update username");
      }
      // After updating username, submit takes
      const newTakeIDs = await submitAllTakes(receiptId);
      // Fire-and-forget SMS notification to the user
      try {
        fetch("/api/notifyPackSubmitted", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packURL: window?.location?.pathname.split("/")[2], packTitle, receiptId }),
        });
      } catch {}
      openModal("packCompleted", { packTitle, receiptId, newTakeIDs });
    } catch (err) {
      console.error("[UsernameRequiredModal] updateUsername error:", err);
      setError("Could not update username. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-2xl font-bold mb-4">Choose a Username</h2>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={handleSubmitUsername}>
        <label className="block mb-2 font-semibold text-gray-700">Username:</label>
        <input
          type="text"
          value={username}
          // Clear the placeholder default when user focuses the field
          onFocus={() => { if (username === defaultUsername) setUsername(""); }}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Your username"
        />
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </GlobalModal>
  );
} 