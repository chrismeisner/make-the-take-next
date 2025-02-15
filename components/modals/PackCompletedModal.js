// File: /components/modals/PackCompletedModal.js
import React from "react";
import GlobalModal from "./GlobalModal";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function PackCompletedModal({ isOpen, onClose, packTitle }) {
  const { data: session } = useSession();
  const router = useRouter();
  const profileID = session?.user?.profileID;

  const handleProfileNavigation = () => {
	onClose(); // Close the modal first
	router.push(`/profile/${profileID}`);
  };

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <div className="p-4">
		<h2 className="text-2xl font-bold mb-4">Congratulations!</h2>
		<p className="mb-4">
		  Thank you for completing the pack <strong>{packTitle}</strong>.
		</p>
		<div className="flex justify-end gap-2">
		  <button
			onClick={onClose}
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
