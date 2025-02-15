// File: /components/modals/TeamsModal.js
import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";

export default function TeamsModal({ isOpen, onClose, onTeamSelected }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
	if (!isOpen) return;
	async function fetchTeams() {
	  setLoading(true);
	  setError("");
	  try {
		const res = await fetch("/api/teams");
		const data = await res.json();
		if (data.success) {
		  // Filter out teams with teamType "league"
		  const filteredTeams = data.teams.filter(
			(team) => team.teamType !== "league"
		  );
		  // Sort teams by teamID alphabetically
		  const sorted = filteredTeams.sort((a, b) =>
			a.teamID.localeCompare(b.teamID)
		  );
		  setTeams(sorted);
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

  async function handleSubmit() {
	if (!selectedTeam) {
	  alert("Please select a team before submitting.");
	  return;
	}
	setSaving(true);
	try {
	  await onTeamSelected(selectedTeam);
	  onClose();
	} catch (error) {
	  console.error("Error during team submission:", error);
	} finally {
	  setSaving(false);
	}
  }

  async function handleNoPreference() {
	setSaving(true);
	try {
	  await onTeamSelected("nba");
	  onClose();
	} catch (error) {
	  console.error("Error during team submission:", error);
	} finally {
	  setSaving(false);
	}
  }

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <h2 className="text-xl font-bold mb-4">Select Your Favorite Team</h2>
	  {loading && <p>Loading teams...</p>}
	  {error && <p className="text-red-600">{error}</p>}
	  {!loading && !error && (
		<div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-8 gap-1 sm:gap-2 lg:gap-2">
		  {teams.map((team) => (
			<button
			  key={team.teamID}
			  className={`flex flex-col items-center p-2 border rounded hover:bg-gray-100 ${
				selectedTeam === team.teamID ? "border-blue-500" : ""
			  }`}
			  onClick={() => setSelectedTeam(team.teamID)}
			>
			  {team.teamLogo && team.teamLogo.length > 0 ? (
				<img
				  src={team.teamLogo[0].url}
				  alt={team.teamName}
				  className="w-12 h-12 object-cover"
				/>
			  ) : (
				<div className="w-12 h-12 bg-gray-300 flex items-center justify-center">
				  ?
				</div>
			  )}
			  <span className="text-sm mt-1">{team.teamName}</span>
			</button>
		  ))}
		</div>
	  )}
	  <div className="mt-6 flex justify-end space-x-2">
		<button
		  onClick={handleNoPreference}
		  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
		  disabled={saving}
		>
		  No Preference
		</button>
		<button
		  onClick={handleSubmit}
		  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
		  disabled={!selectedTeam || saving}
		>
		  {saving ? "Saving..." : "Submit"}
		</button>
	  </div>
	</GlobalModal>
  );
}
