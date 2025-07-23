// File: /components/modals/PackCompletedModal.js
import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function PackCompletedModal({ isOpen, onClose, packTitle, receiptId, newTakeIDs = [] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const profileID = session?.user?.profileID;
  const [receiptUrl, setReceiptUrl] = useState("");

  useEffect(() => {
    if (receiptId && router.query.packURL) {
      setReceiptUrl(`${window.location.origin}/packs/${router.query.packURL}/${receiptId}`);
    }
  }, [receiptId, router.query.packURL]);

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
		{receiptUrl && (
		  <p className="mb-4 break-all">
			Your receipt is here:{" "}
			<a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
			  {receiptUrl}
			</a>
		  </p>
		)}
		{/* Display created take record IDs for verification */}
		{newTakeIDs.length > 0 && (
		  <div className="mb-4">
			<p className="mb-2 font-medium">Records created:</p>
			<ul className="list-disc list-inside">
			  {newTakeIDs.map((id) => (
				<li key={id} className="text-sm break-all">{id}</li>
			  ))}
			</ul>
		  </div>
		)}
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
