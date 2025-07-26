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
        const { friendName, friendTakesByProp, packProps } = modalConfig.modalProps;
        return (
          <GlobalModal isOpen={true} onClose={closeModal}>
            <h2 className="text-2xl font-bold mb-4">
              You've been challenged by {friendName}!
            </h2>
            <ul className="space-y-2">
              {packProps.map((p) => {
                const take = friendTakesByProp[p.propID];
                if (!take) return null;
                const label = p.propShort || p.propTitle || p.propID;
                const sideLabel = take.side === 'A' ? p.sideALabel : p.sideBLabel;
                return (
                  <li key={p.propID} className="flex justify-between">
                    <span>{label}</span>
                    <span className="font-semibold">{sideLabel}</span>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={closeModal}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
            >
              OK
            </button>
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
        const { packTitle, picksText, challengeUrl } = modalConfig.modalProps;
        return (
          <ChallengeShareModal
            isOpen={true}
            onClose={closeModal}
            packTitle={packTitle}
            picksText={picksText}
            challengeUrl={challengeUrl}
          />
        );
      }
	default:
	  return null;
  }
}
