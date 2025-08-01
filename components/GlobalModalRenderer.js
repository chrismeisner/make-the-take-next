// File: /components/GlobalModalRenderer.js

import React from "react";
import { useModal } from "../contexts/ModalContext";
import LoginRequiredModal from "./modals/LoginRequiredModal";
import UsernameRequiredModal from "./modals/UsernameRequiredModal";
import GlobalModal from "./modals/GlobalModal";
import TeamsModal from "./modals/TeamsModal";
import PointsModal from "./modals/PointsModal";
import PrizeModal from "./modals/PrizeModal";
import FeaturedPackModal from "./modals/FeaturedPackModal";
import PackCompletedModal from "./modals/PackCompletedModal";
import MembersAccessModal from "./modals/MembersAccessModal"; // <-- Import your new modal
import SuperPropCreatedModal from "./modals/SuperPropCreatedModal";
import GradePacksModal from "./modals/GradePacksModal";
import QRCodeModal from "./modals/QRCodeModal";
import ChallengeShareModal from "./modals/ChallengeShareModal";

export default function GlobalModalRenderer() {
  const { modalConfig, closeModal } = useModal();

  if (!modalConfig.modalType) {
	return null;
  }

  switch (modalConfig.modalType) {
	case "challenge":
	  {
        // Include the logged-in user's takes
        const { friendName, friendTakesByProp, challengerTakesByProp, packProps, packURL, initiatorReceiptId, challengerReceiptId, propIndex } = modalConfig.modalProps;
        const propsToShow = (typeof propIndex === 'number' && propIndex >= 0 && propIndex < packProps.length)
          ? [packProps[propIndex]]
          : packProps;
        // Handler to accept the challenge by creating/updating the challenge record
        const handleAccept = async () => {
          try {
            await fetch('/api/challenges', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ packURL, initiatorReceiptId, challengerReceiptId }),
            });
            closeModal();
          } catch (err) {
            console.error('Error accepting challenge:', err);
          }
        };
        return (
          <GlobalModal isOpen={true} onClose={closeModal}>
            <h2 className="text-2xl font-bold mb-4">
              You've been challenged by {friendName}!
            </h2>
            <ul className="space-y-2">
              {propsToShow.map((p) => {
                const take = friendTakesByProp[p.propID];
                if (!take) return null;
                // Show full question text from the prop
                const question = p.propSummary || p.propTitle || p.propShort || p.propID;
                // Friend's chosen statement
                const chosenStatement = take.side === 'A' ? p.sideALabel : p.sideBLabel;
                // Logged-in user's own statement
                const userTake = challengerTakesByProp?.[p.propID];
                const yourStatement = userTake ? (userTake.side === 'A' ? p.sideALabel : p.sideBLabel) : null;
                return (
                  <li key={p.propID} className="mb-4">
                    <p className="text-base mb-1">{question}</p>
                    <p className="font-semibold mb-1">{chosenStatement}</p>
                    {yourStatement && (
                      <p className="text-sm text-gray-600">Your take: {yourStatement}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* If user has made takes (challengerReceiptId), show Accept button */}
            {challengerReceiptId ? (
              <div className="mt-4 flex space-x-2">
                <button
                  onClick={handleAccept}
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  Accept Challenge
                </button>
                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-500 text-white rounded"
                >
                  Close
                </button>
              </div>
            ) : (
              <button
                onClick={closeModal}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
              >
                OK
              </button>
            )}
          </GlobalModal>
        );
      }
	case "featuredPack":
	  return (
		<FeaturedPackModal
		  isOpen={true}
		  onClose={closeModal}
		  {...modalConfig.modalProps}
		/>
	  );
	case "favoriteTeam":
	  return (
		<TeamsModal
		  isOpen={true}
		  onClose={closeModal}
		  onTeamSelected={modalConfig.modalProps.onTeamSelected}
		/>
	  );
	case "points":
	  return (
		<PointsModal
		  isOpen={true}
		  onClose={closeModal}
		  points={modalConfig.modalProps.points}
		/>
	  );
	case "prize":
	  return (
		<PrizeModal
		  isOpen={true}
		  onClose={closeModal}
		  prize={modalConfig.modalProps.prize}
		/>
	  );
	case "packCompleted":
	  return (
		<PackCompletedModal
		  isOpen={true}
		  onClose={closeModal}
		  packTitle={modalConfig.modalProps.packTitle}
		  receiptId={modalConfig.modalProps.receiptId}
		  newTakeIDs={modalConfig.modalProps.newTakeIDs}
		  selectedChoices={modalConfig.modalProps.selectedChoices}
		  packProps={modalConfig.modalProps.packProps}
		/>
	  );
	case "membersAccess": // <-- NEW case
	  return (
		<MembersAccessModal
		  isOpen={true}
		  onClose={closeModal}
		  {...modalConfig.modalProps}
		/>
	  );
	case "superPropCreated": {
	  const { url, onDone } = modalConfig.modalProps;
	  return (
		<SuperPropCreatedModal
		  isOpen={true}
		  onClose={closeModal}
		  url={url}
		  onDone={onDone}
		/>
	  );
	}
	case "loginRequired":
	  return (
		<LoginRequiredModal
		  isOpen={true}
		  onClose={closeModal}
		  receiptId={modalConfig.modalProps.receiptId}
		  packTitle={modalConfig.modalProps.packTitle}
		  submitAllTakes={modalConfig.modalProps.submitAllTakes}
		/>
	  );
	case "usernameRequired":
	  return (
		<UsernameRequiredModal
		  isOpen={true}
		  onClose={closeModal}
		  receiptId={modalConfig.modalProps.receiptId}
		  packTitle={modalConfig.modalProps.packTitle}
		  submitAllTakes={modalConfig.modalProps.submitAllTakes}
		  profileID={modalConfig.modalProps.profileID}
		/>
	  );
	case "gradePacks":
	  return (
		<GradePacksModal
		  isOpen={true}
		  onClose={closeModal}
		  packs={modalConfig.modalProps.packs}
		/>
	  );
	case "qrCode":
	  return (
		<QRCodeModal
		  isOpen={true}
		  onClose={closeModal}
		  url={modalConfig.modalProps.url}
		/>
	  );
	case "challengeShare":
	  {
        const { packTitle, picksText, challengeUrl, propQuestion, sideTake } = modalConfig.modalProps;
        return (
          <ChallengeShareModal
            isOpen={true}
            onClose={closeModal}
            packTitle={packTitle}
            picksText={picksText}
            challengeUrl={challengeUrl}
            propQuestion={propQuestion}
            sideTake={sideTake}
          />
        );
      }
	default:
	  return null;
  }
}
