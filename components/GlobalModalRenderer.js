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
import ChallengeShareModal from "./modals/ChallengeShareModal";
import ExchangeConfirmModal from "./modals/ExchangeConfirmModal";
import MarketplaceInfoModal from "./modals/MarketplaceInfoModal";
import AddPacksToContestModal from "./modals/AddPacksToContestModal";
import MobileNavModal from "./modals/MobileNavModal";
import ShareContestModal from "./modals/ShareContestModal";
import WelcomeModal from "./modals/WelcomeModal";
import SharePackModal from "./modals/SharePackModal";
import FetchEventsModal from "./modals/FetchEventsModal";
import FetchTeamsModal from "./modals/FetchTeamsModal";
import PackActiveModal from "./modals/PackActiveModal";
import LoginModal from "./modals/LoginModal";
import { getDataBackend } from "../lib/runtimeConfig";

export default function GlobalModalRenderer() {
  const { modalConfig, closeModal } = useModal();

  if (!modalConfig.modalType) {
	return null;
  }

  switch (modalConfig.modalType) {
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
    case "welcome": {
      const { contestHref } = modalConfig.modalProps;
      return (
        <WelcomeModal
          isOpen={true}
          onClose={closeModal}
          contestHref={contestHref}
        />
      );
    }
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
