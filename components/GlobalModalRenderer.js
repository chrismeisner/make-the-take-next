// File: /components/GlobalModalRenderer.js

import React from "react";
import { useModal } from "../contexts/ModalContext";
import LoginRequiredModal from "./modals/LoginRequiredModal";
import GlobalModal from "./modals/GlobalModal";
import TeamsModal from "./modals/TeamsModal";
import PointsModal from "./modals/PointsModal";
import PrizeModal from "./modals/PrizeModal";
import FeaturedPackModal from "./modals/FeaturedPackModal";
import PackCompletedModal from "./modals/PackCompletedModal";
import MembersAccessModal from "./modals/MembersAccessModal"; // <-- Import your new modal
import PackGradedModal from "./modals/PackGradedModal";
import SuperPropCreatedModal from "./modals/SuperPropCreatedModal";
import AddEventModal from "./modals/AddEventModal";
import AddPropModal from "./modals/AddPropModal";
import GenerateSummaryModal from "./modals/GenerateSummaryModal";
import GradePacksModal from "./modals/GradePacksModal";
import GradePropsModal from "./modals/GradePropsModal";
import GetPackWinnersModal from "./modals/GetPackWinnersModal";
import QRCodeModal from "./modals/QRCodeModal";
// Challenge functionality has been removed
import ExchangeConfirmModal from "./modals/ExchangeConfirmModal";
import MarketplaceInfoModal from "./modals/MarketplaceInfoModal";
import AddPacksToContestModal from "./modals/AddPacksToContestModal";
import MobileNavModal from "./modals/MobileNavModal";
import ShareContestModal from "./modals/ShareContestModal";
import SharePackModal from "./modals/SharePackModal";
import FetchEventsModal from "./modals/FetchEventsModal";
import FetchTeamsModal from "./modals/FetchTeamsModal";
import PackActiveModal from "./modals/PackActiveModal";
import LoginModal from "./modals/LoginModal";
import AwardClaimModal from "./modals/AwardClaimModal";
import AwardSuccessModal from "./modals/AwardSuccessModal";
import { getDataBackend } from "../lib/runtimeConfig";

export default function GlobalModalRenderer() {
  const { modalConfig, closeModal } = useModal();

  if (!modalConfig.modalType) {
	return null;
  }

  switch (modalConfig.modalType) {
    case "awardClaim": {
      const { code } = modalConfig.modalProps;
      return (
        <AwardClaimModal
          isOpen={true}
          onClose={closeModal}
          code={code}
        />
      );
    }
    case "awardSuccess": {
      const { name, tokens, error, redirectTeamSlug, imageUrl } = modalConfig.modalProps;
      return (
        <AwardSuccessModal
          isOpen={true}
          onClose={closeModal}
          name={name}
          tokens={tokens}
          error={error}
          redirectTeamSlug={redirectTeamSlug}
          imageUrl={imageUrl}
        />
      );
    }
    case "login": {
      const { title, ctaLabel, onSuccess } = modalConfig.modalProps;
      return (
        <LoginModal
          isOpen={true}
          onClose={closeModal}
          title={title}
          ctaLabel={ctaLabel}
          onSuccess={onSuccess}
        />
      );
    }
    case "fetchTeams": {
      const { onFetched } = modalConfig.modalProps;
      return (
        <FetchTeamsModal
          isOpen={true}
          onClose={closeModal}
          onFetched={onFetched}
        />
      );
    }
    case "packActive": {
      const { packTitle, packURL, coverUrl, packCloseTime } = modalConfig.modalProps;
      return (
        <PackActiveModal
          isOpen={true}
          onClose={closeModal}
          packTitle={packTitle}
          packURL={packURL}
          coverUrl={coverUrl}
          packCloseTime={packCloseTime}
        />
      );
    }
    case "fetchEvents": {
      const { onFetched } = modalConfig.modalProps;
      return (
        <FetchEventsModal
          isOpen={true}
          onClose={closeModal}
          onFetched={onFetched}
        />
      );
    }
    // case "notifyMe": removed — individual pack notifications deprecated
    case "shareContest": {
      const { contestTitle, contestSummary, contestUrl } = modalConfig.modalProps;
      return (
        <ShareContestModal
          isOpen={true}
          onClose={closeModal}
          contestTitle={contestTitle}
          contestSummary={contestSummary}
          contestUrl={contestUrl}
        />
      );
    }
    case "sharePack": {
      const { packTitle, packSummary, packUrl } = modalConfig.modalProps;
      return (
        <SharePackModal
          isOpen={true}
          onClose={closeModal}
          packTitle={packTitle}
          packSummary={packSummary}
          packUrl={packUrl}
        />
      );
    }
    case "mobileNav": {
      const { items } = modalConfig.modalProps;
      return (
        <MobileNavModal isOpen={true} onClose={closeModal} items={items} />
      );
    }
    case "addPacksToContest": {
      const { initialSelected, onConfirm } = modalConfig.modalProps;
      return (
        <AddPacksToContestModal
          isOpen={true}
          onClose={closeModal}
          initialSelected={initialSelected}
          onConfirm={onConfirm}
        />
      );
    }
    case "exchangeConfirm": {
      const { item, onConfirm } = modalConfig.modalProps;
      return (
        <ExchangeConfirmModal
          isOpen={true}
          onClose={closeModal}
          item={item}
          onConfirm={onConfirm}
        />
      );
    }
    case "marketplaceInfo": {
      const { item, tokenBalance, onGo, onRedeem } = modalConfig.modalProps;
      return (
        <MarketplaceInfoModal
          isOpen={true}
          onClose={closeModal}
          item={item}
          tokenBalance={tokenBalance}
          onGo={onGo}
          onRedeem={onRedeem}
        />
      );
    }
	// Challenge functionality has been removed
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
	  if (getDataBackend && getDataBackend() === 'postgres') {
		return null;
	  }
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
	case "packGraded":
	  return (
		<PackGradedModal
		  isOpen={true}
		  onClose={closeModal}
		  packTitle={modalConfig.modalProps.packTitle}
		  packProps={modalConfig.modalProps.packProps}
		  packURL={modalConfig.modalProps.packURL}
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
	case "addEvent":
	  return (
		<AddEventModal
		  isOpen={true}
		  onClose={closeModal}
		  onEventSelected={modalConfig.modalProps.onEventSelected}
		  allowMultiSelect={modalConfig.modalProps.allowMultiSelect}
		  initialLeague={modalConfig.modalProps.initialLeague}
		  initialDate={modalConfig.modalProps.initialDate}
		/>
	  );
	case "addProp":
	  return (
		<AddPropModal
		  isOpen={true}
		  onClose={closeModal}
		  onPropsAdded={modalConfig.modalProps.onPropsAdded}
          initialLeague={modalConfig.modalProps.initialLeague}
          excludeIds={modalConfig.modalProps.excludeIds}
          viewName={modalConfig.modalProps.viewName || 'Open'}
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
	case "gradeProps":
	  return (
		<GradePropsModal
		  isOpen={true}
		  onClose={closeModal}
		  props={modalConfig.modalProps.props}
		/>
	  );
    case "getPackWinners":
      return (
        <GetPackWinnersModal
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
		  title={modalConfig.modalProps.title}
		/>
	  );
	// Challenge functionality has been removed
    case "aiSummaryContext": {
      const { defaultPrompt, serverPrompt, defaultModel, onGenerate, onUse } = modalConfig.modalProps;
      return (
        <GenerateSummaryModal
          isOpen={true}
          onClose={closeModal}
          defaultPrompt={defaultPrompt}
          serverPrompt={serverPrompt}
          defaultModel={defaultModel}
          onGenerate={(context, model) => onGenerate?.(context, model)}
          onUse={(text) => { try { onUse?.(text); } finally { closeModal(); } }}
        />
      );
    }
	default:
	  return null;
  }
}
