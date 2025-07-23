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

export default function GlobalModalRenderer() {
  const { modalConfig, closeModal } = useModal();

  if (!modalConfig.modalType) {
	return null;
  }

  switch (modalConfig.modalType) {
	case "challenge":
	  return (
		<GlobalModal isOpen={true} onClose={closeModal}>
		  <h2 className="text-2xl font-bold mb-4">
			You've been challenged by {modalConfig.modalProps.friendName}!
		  </h2>
		  <button
			onClick={closeModal}
			className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
		  >
			OK
		  </button>
		</GlobalModal>
	  );
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

	default:
	  return null;
  }
}
