// File: components/FavoriteTeamChecker.js
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import TeamsModal from "./modals/TeamsModal";

export default function FavoriteTeamChecker() {
  const { data: session } = useSession();
  const [showModal, setShowModal] = useState(false);

  // This example assumes your profile data is available via an API route.
  // You might already have profile data in your session or a context,
  // but here we fetch the profile details using the profileID.
  useEffect(() => {
	if (!session?.user) return;
	async function checkFavoriteTeam() {
	  try {
		const res = await fetch(`/api/profile/${session.user.profileID}`);
		const data = await res.json();
		// If the API returns success and there is no profileTeamData, show the modal.
		if (data.success && !data.profile.profileTeamData) {
		  setShowModal(true);
		}
	  } catch (err) {
		console.error("Error checking favorite team", err);
	  }
	}
	checkFavoriteTeam();
  }, [session]);

  // This function is called when a team is selected from the modal.
  // You can hook into your updateTeam API here.
  function handleTeamSelected(team) {
	// For example, POST the new team to your API, then:
	setShowModal(false);
  }

  return (
	<TeamsModal
	  isOpen={showModal}
	  onClose={() => setShowModal(false)}
	  onTeamSelected={handleTeamSelected}
	/>
  );
}
