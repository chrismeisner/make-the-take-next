import React, { useState } from "react";
import { usePackContext } from "../contexts/PackContext";
import { useModal } from "../contexts/ModalContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function CardProgressFooter() {
  const { packData, selectedChoices, submitAllTakes, userTakesByProp } = usePackContext();
  const { openModal } = useModal();
  const { data: session } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const totalProps = packData.props.length;
  // If user has submits for all props, allow resubmission
  const previousSubmissions = Object.keys(userTakesByProp).length === totalProps;
  const selectedCount = Object.keys(selectedChoices).length;
  const progressPercentage = totalProps === 0 ? 0 : Math.round((selectedCount / totalProps) * 100);
  // Determine if selections differ from previous submission
  const hasChanges = previousSubmissions
    ? Object.entries(selectedChoices).some(
        ([propID, side]) => userTakesByProp[propID]?.side !== side
      )
    : true;
  const canSubmit = selectedCount > 0 && hasChanges;

  // Handle click: submit takes then show confirmation modal
  async function handleSubmit() {
    const receiptId = Math.random().toString(36).substring(2, 8);
    if (!session?.user) {
      openModal("loginRequired", { receiptId, packTitle: packData.packTitle, submitAllTakes });
      return;
    }
    setIsSubmitting(true);
    const newTakeIDs = await submitAllTakes(receiptId);
    // Update the URL query with userReceiptId so link appears without a full reload
    router.replace(
      { pathname: router.pathname, query: { ...router.query, userReceiptId: receiptId } },
      undefined,
      { shallow: true }
    );
    openModal("packCompleted", { packTitle: packData.packTitle, receiptId, newTakeIDs, selectedChoices, packProps: packData.props });
    setIsSubmitting(false);
  }

  return (
    <>
      {isSubmitting && (
        <div className="fixed inset-0 bg-black opacity-50 z-40 flex items-center justify-center">
          <div className="text-white text-lg">Submitting...</div>
        </div>
      )}
      <footer className="fixed bottom-0 inset-x-0 bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] border-t border-gray-200 z-50 md:static md:border-t-0 md:p-0 md:bg-transparent">
      <div
        style={{
          backgroundColor: "#e0e0e0",
          height: "6px",
          borderRadius: "3px",
          overflow: "hidden",
          width: "100%",
        }}
      >
        <div
          style={{
            backgroundColor: "#2196f3",
            width: `${progressPercentage}%`,
            height: "100%",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
        <p
        style={{
          margin: "0",
          fontSize: "0.8rem",
          color: "#666",
          textAlign: "left",
        }}
      >
        {selectedCount} / {totalProps} Takes Made
        </p>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            backgroundColor: canSubmit ? '#2196f3' : '#ccc',
            color: '#fff',
            padding: '0.25rem 0.75rem',
            border: 'none',
            borderRadius: '3px',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {previousSubmissions ? 'Resubmit' : 'Submit'}
        </button>
      </div>
    </footer>
    </>
  );
} 