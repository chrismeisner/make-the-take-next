// components/modals/TeamsModal.js

import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";

export default function TeamsModal({ isOpen, onClose, onTeamSelected }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Store the selected team's Airtable record id.
  const [selectedTeamRecordId, setSelectedTeamRecordId] = useState(null);
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
		  // Filter out teams with teamType "league" and sort by teamNameFull.
		  const sortedTeams = data.teams
			.filter(team => team.teamType !== "league")
			.sort((a, b) => a.teamNameFull.localeCompare(b.teamNameFull));
		  setTeams(sortedTeams);
		} else {
		  setError(data.error || "Failed to load teams");
		}
	  } catch {
		setError("Error fetching teams");
	  } finally {
		setLoading(false);
	  }
	}
	fetchTeams();
  }, [isOpen]);

  // Toggle selection using the team's Airtable record id.
  const toggleTeam = (teamRecordId) => {
	setSelectedTeamRecordId(prev => (prev === teamRecordId ? null : teamRecordId));
  };

  const handleSubmit = async () => {
	if (!selectedTeamRecordId) {
	  alert("Please select a team before submitting.");
	  return;
	}
	setSaving(true);
	try {
	  // Pass the selected team's record id to the parent callback.
	  await onTeamSelected(selectedTeamRecordId);
	  onClose();
	} catch (err) {
	  console.error("Error during team submission:", err);
	} finally {
	  setSaving(false);
	}
  };

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <h2 className="text-xl font-bold mb-4 text-center">Select Your Favorite Team</h2>
	  {loading && <p className="text-center">Loading teams...</p>}
	  {error && <p className="text-red-600 text-center">{error}</p>}
	  {!loading && !error && (
		<div className="grid grid-cols-6 sm:grid-cols-6 lg:grid-cols-8 gap-0">
		  {teams.map(team => (
			<button
			  key={team.recordId}
			  onClick={() => toggleTeam(team.recordId)}
			  className={`aspect-square flex items-center justify-center p-2 rounded transition-all duration-300 ease-in-out ${
				selectedTeamRecordId === team.recordId
				  ? "opacity-100 outline outline-1 outline-white/40"
				  : "opacity-40 hover:opacity-80"
			  }`}
			>
			  {team.teamLogo && team.teamLogo.length > 0 ? (
				<div className="w-full h-full p-2 sm:p-1">
				  <img
					src={team.teamLogo[0].url}
					alt={team.teamName}
					className="w-full h-full object-contain"
				  />
				</div>
			  ) : (
				<div className="w-full h-full bg-gray-300 flex items-center justify-center p-2 sm:p-1">
				  ?
				</div>
			  )}
			</button>
		  ))}
		</div>
	  )}
	  <div className="mt-6 flex justify-center">
		<button
		  onClick={handleSubmit}
		  disabled={!selectedTeamRecordId || saving}
		  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
		>
		  {saving ? "Saving..." : "Submit"}
		</button>
	  </div>
	</GlobalModal>
  );
}
