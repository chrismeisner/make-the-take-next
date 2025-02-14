// File: /components/modals/TeamsModal.js
import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";

/**
 * TeamsModal
 * - isOpen: boolean to control visibility
 * - onClose: function to close the modal
 * - onTeamSelected: function(teamID) => called when the user picks a team
 */
export default function TeamsModal({ isOpen, onClose, onTeamSelected }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
	if (!isOpen) return;
	async function fetchTeams() {
	  try {
		const res = await fetch("/api/teams");
		const data = await res.json();
		if (data.success) {
		  setTeams(data.teams);
		} else {
		  setError(data.error || "Failed to load teams");
		}
	  } catch (err) {
		console.error("Error fetching teams:", err);
		setError("Error fetching teams");
	  } finally {
		setLoading(false);
	  }
	}
	fetchTeams();
  }, [isOpen]);

  function handleSelectTeam(teamID) {
	onTeamSelected(teamID);
  }

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <h2 className="text-xl font-bold mb-4">Select Your Favorite Team</h2>
	  {loading && <p>Loading teams...</p>}
	  {error && <p className="text-red-600">{error}</p>}
	  {!loading && !error && (
		<div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1 sm:gap-2 lg:gap-2">
		  {teams.map((team) => (
			<button
			  key={team.teamID}
			  className="flex flex-col items-center p-2 border rounded hover:bg-gray-100"
			  onClick={() => handleSelectTeam(team.teamID)}
			>
			  {team.teamLogo && team.teamLogo.length > 0 ? (
				<img
				  src={team.teamLogo[0].url}
				  alt={team.teamName}
				  className="w-12 h-12 object-cover rounded-full"
				/>
			  ) : (
				<div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
				  ?
				</div>
			  )}
			</button>
		  ))}
		</div>
	  )}
	  <button
		className="mt-6 px-4 py-2 bg-blue-600 text-white rounded"
		onClick={onClose}
	  >
		Cancel
	  </button>
	</GlobalModal>
  );
}
