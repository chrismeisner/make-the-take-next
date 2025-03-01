import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";

export default function FavoriteTeamSelectorModal({ isOpen, onClose, onTeamSelected }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
	if (!isOpen) return;
	async function fetchTeams() {
	  console.log("🚀 [FavoriteTeamSelectorModal] Loading teams from Airtable...");
	  setLoading(true);
	  setError("");
	  try {
		const res = await fetch("/api/teams");
		const data = await res.json();
		console.log("📥 [FavoriteTeamSelectorModal] Received teams data:", data);
		if (data.success) {
		  const filteredTeams = data.teams.filter(team => team.teamType !== "league");
		  const sorted = filteredTeams.sort((a, b) =>
			a.teamNameFull.localeCompare(b.teamNameFull)
		  );
		  setTeams(sorted);
		  console.log("✅ [FavoriteTeamSelectorModal] Teams loaded:", sorted);
		} else {
		  setError(data.error || "Failed to load teams");
		  console.error("❌ [FavoriteTeamSelectorModal] Error loading teams:", data.error);
		}
	  } catch (err) {
		console.error("💥 [FavoriteTeamSelectorModal] Error fetching teams:", err);
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
	  console.log(`🎯 [FavoriteTeamSelectorModal] Submitting selected team: ${selectedTeam}`);
	  await onTeamSelected(selectedTeam);
	  onClose();
	} catch (error) {
	  console.error("💥 [FavoriteTeamSelectorModal] Error during team submission:", error);
	} finally {
	  setSaving(false);
	}
  }

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <h2 className="text-xl font-bold mb-4 text-center">Select Your Favorite Team</h2>
	  {loading && <p className="text-center">Loading teams...</p>}
	  {error && <p className="text-red-600 text-center">{error}</p>}
	  {!loading && !error && (
		<div className="flex flex-wrap justify-center gap-2">
		  {teams.map((team) => (
			<button
			  key={team.teamID}
			  onClick={() => {
				console.log(`🎯 [FavoriteTeamSelectorModal] Team selected: ${team.teamName}`);
				setSelectedTeam(team.teamName);
			  }}
			  className={`w-20 h-20 flex items-center justify-center rounded transition-all duration-300 ease-in-out p-2 ${
				selectedTeam === team.teamName
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
		  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
		  disabled={!selectedTeam || saving}
		>
		  {saving ? "Saving..." : "Submit"}
		</button>
	  </div>
	</GlobalModal>
  );
}
