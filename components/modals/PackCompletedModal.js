// File: /components/modals/PackCompletedModal.js
import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function PackCompletedModal({ isOpen, onClose, packTitle, receiptId, newTakeIDs = [], selectedChoices = {}, packProps = [] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const profileID = session?.user?.profileID;
  const [challengeUrl, setChallengeUrl] = useState("");

  // Prepare picks text for sharing
  const picksText = packProps.map((p) => {
    const side = selectedChoices[p.propID];
    if (!side) return null;
    const sideLabel = side === "A" ? (p.PropSideAShort || "A") : (p.PropSideBShort || "B");
    const label = p.propShort || p.propTitle || p.propID;
    return `${label}: ${sideLabel}`;
  }).filter(Boolean).join(', ');

  useEffect(() => {
    if (receiptId && router.query.packURL) {
      setChallengeUrl(`${window.location.origin}/packs/${router.query.packURL}?ref=${receiptId}`);
    }
  }, [receiptId, router.query.packURL]);

  const handleProfileNavigation = () => {
	onClose(); // Close the modal first
	router.push(`/profile/${profileID}`);
  };

// Define handleShare to open native share sheet or fallback to copy
const handleShare = async () => {
	if (navigator.share) {
		try {
			await navigator.share({
				title: `Challenge a friend: ${packTitle}`,
				text: picksText
					? `My picks: ${picksText}. Can you beat my score on ${packTitle}?`
					: `Can you beat my score on ${packTitle}?`,
				url: challengeUrl,
			});
		} catch (error) {
			console.error("Error sharing", error);
		}
	} else {
		try {
			await navigator.clipboard.writeText(
				picksText
					? `My picks: ${picksText}. ${challengeUrl}`
					: challengeUrl
			);
			alert("Message copied to clipboard");
		} catch (error) {
			console.error("Failed to copy", error);
		}
	}
};

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <div className="p-4">
		<h2 className="text-2xl font-bold mb-4">Congratulations!</h2>
		<p className="mb-4">
		  Thank you for completing the pack <strong>{packTitle}</strong>.
		</p>
		{challengeUrl && (
		  <div className="mb-4">
			<p className="mb-2 font-medium">Challenge a friend:</p>
			<button
				onClick={handleShare}
				className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
			>
				Share this pack
			</button>
		  </div>
		)}
		{/* Display created take record IDs for verification */}
		{/* Removed per request: hide created records list */}
		<div className="flex justify-end gap-2">
		  <button
			onClick={() => {
			  onClose();
			  router.reload();
			}}
			className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
		  >
			Close
		  </button>
		  {profileID && (
			<button
			  onClick={handleProfileNavigation}
			  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
			>
			  Go to My Profile
			</button>
		  )}
		</div>
	  </div>
	</GlobalModal>
  );
}
