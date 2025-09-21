// File: /components/modals/PackCompletedModal.js
import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";
import { useModal } from "../../contexts/ModalContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function PackCompletedModal({ isOpen, onClose, packTitle, receiptId, newTakeIDs = [], selectedChoices = {}, packProps = [] }) {
  const { data: session } = useSession();
  const router = useRouter();
  const profileID = session?.user?.profileID;
  // Challenge functionality has been removed
  const [receiptUrl, setReceiptUrl] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const { openModal } = useModal();

  // Prepare a primary take text for sharing (use the first selected prop's take text)
  const primaryTakeText = (() => {
    const selectedPropIDs = Object.keys(selectedChoices || {});
    if (selectedPropIDs.length === 0) return "";
    const firstPropId = selectedPropIDs[0];
    const prop = packProps.find((p) => p.propID === firstPropId);
    if (!prop) return "";
    const side = selectedChoices[firstPropId];
    if (side === "A") return prop.propSideATake || prop.PropSideATake || prop.PropSideAShort || "";
    if (side === "B") return prop.propSideBTake || prop.PropSideBTake || prop.PropSideBShort || "";
    return "";
  })();

  useEffect(() => {
    if (receiptId && router.query.packURL) {
      const base = `${window.location.origin}/packs/${router.query.packURL}/${receiptId}`;
      setReceiptUrl(base);
      try {
        let urlWithRef = base;
        if (session?.user?.profileID) {
          const u = new URL(base);
          u.searchParams.set("ref", session.user.profileID);
          urlWithRef = u.toString();
        }
        setShareUrl(urlWithRef);
      } catch {
        setShareUrl(base);
      }
    }
  }, [receiptId, router.query.packURL, session?.user?.profileID]);

  const handleProfileNavigation = () => {
	onClose(); // Close the modal first
	router.push(`/profile/${profileID}`);
  };

// Define handleShare to open native share sheet or fallback to copy
const handleShare = async () => {
  if (navigator.share) {
    try {
      const textLines = [];
      textLines.push(`I just made my takes on ${packTitle}`);
      if (primaryTakeText) {
        textLines.push(`🔮 ${primaryTakeText}`);
      }
      textLines.push(`Think you can beat my takes?`);
      await navigator.share({
        title: `Share your takes: ${packTitle}`,
        text: textLines.join("\n"),
        url: shareUrl || receiptUrl,
      });
    } catch (error) {
      console.error("Error sharing", error);
    }
  } else {
    try {
      await navigator.clipboard.writeText(shareUrl || receiptUrl);
      alert("Link copied to clipboard");
    } catch (error) {
      console.error("Failed to copy", error);
    }
  }
};

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl || receiptUrl);
    alert("Link copied to clipboard");
  } catch {}
};

const handleGenerateQR = () => {
  openModal('qrCode', { url: shareUrl || receiptUrl, title: packTitle || 'Share Pack' });
};

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <div className="p-4">
		<h2 className="text-2xl font-bold mb-4">Congratulations!</h2>
		<p className="mb-4">
		  Thank you for completing the pack <strong>{packTitle}</strong>.
		</p>
		{receiptUrl && (
		  <div className="mb-4">
			<p className="mb-2 font-medium">Share your picks:</p>
			<input
			  type="text"
			  readOnly
			  value={shareUrl || receiptUrl}
			  className="w-full px-3 py-2 border rounded text-sm"
			  onFocus={(e) => e.target.select()}
			/>
			<p className="mt-2 text-xs text-gray-600">When someone uses your link, <span className="font-semibold">you</span> get <span className="font-semibold">+5</span> marketplace tokens.</p>
			<div className="mt-3 flex items-center gap-2">
			  <button onClick={handleShare} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Share</button>
			  <button onClick={handleCopy} className="px-4 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300">Copy link</button>
			  <button onClick={handleGenerateQR} className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-black">Generate QR</button>
			</div>
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
        {receiptUrl && (
          <button
            onClick={() => {
              onClose();
              router.push(receiptUrl);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            View Receipt
          </button>
        )}
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
