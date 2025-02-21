// File: /components/modals/MembersAccessModal.js

import { useState } from "react";
import { useRouter } from "next/router";
import GlobalModal from "./GlobalModal"; // your existing "GlobalModal" wrapper

export default function MembersAccessModal({ isOpen, onClose }) {
  const router = useRouter();
  const [userInput, setUserInput] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
	e.preventDefault();
	setError("");

	try {
	  // 1) Fetch real password from /api/getPassword?passwordID=beta-members
	  const resp = await fetch("/api/getPassword?passwordID=beta-members");
	  const data = await resp.json();

	  if (!resp.ok || !data.success) {
		throw new Error(data.error || "Could not fetch password");
	  }

	  const realPassword = data.password; // e.g. "Secret123"

	  // 2) Compare
	  if (userInput.trim() === realPassword.trim()) {
		// if match => close modal + route to /contests
		onClose();
		router.push("/contests");
	  } else {
		setError("Incorrect password.");
	  }
	} catch (err) {
	  console.error("[MembersAccessModal] handleSubmit error =>", err);
	  setError(err.message || "An error occurred.");
	}
  }

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <h2 className="text-lg font-semibold mb-2">Members Access</h2>
	  <p className="text-sm text-gray-700 mb-4">
		Enter the secret password to access the site.
	  </p>

	  <form onSubmit={handleSubmit}>
		<input
		  type="password"
		  placeholder="Enter password"
		  className="w-full mb-2 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
		  value={userInput}
		  onChange={(e) => setUserInput(e.target.value)}
		/>

		{error && <div className="text-red-600 text-sm mb-2">{error}</div>}

		<div className="flex justify-end space-x-2">
		  <button
			type="button"
			onClick={onClose}
			className="px-3 py-1 border rounded hover:bg-gray-100"
		  >
			Cancel
		  </button>
		  <button
			type="submit"
			className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
		  >
			Submit
		  </button>
		</div>
	  </form>
	</GlobalModal>
  );
}
