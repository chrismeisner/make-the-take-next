import React, { useState, useEffect } from "react";
import { usePackContext } from "../contexts/PackContext";
import { useModal } from "../contexts/ModalContext";
import { useSession } from "next-auth/react";
 

export default function InlineCardProgressFooter() {
  const { packData, selectedChoices, submitAllTakes, userTakesByProp } = usePackContext();
  const { openModal } = useModal();
  const { data: session } = useSession();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const totalProps = packData.props.length;
  const previousSubmissions = Object.keys(userTakesByProp).length === totalProps;
  const selectedCount = Object.keys(selectedChoices).length;
  const progressPercentage = totalProps === 0 ? 0 : Math.round((selectedCount / totalProps) * 100);
  // Determine which selections are new or changed vs. existing takes
  const changedEntries = Object.entries(selectedChoices).filter(
    ([propID, side]) => userTakesByProp[propID]?.side !== side
  );
  const changedCount = changedEntries.length;
  const hasChanges = changedCount > 0;
  const canSubmit = hasChanges;

  // Keyboard shortcut: Enter to submit pack
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ignore if focus is on input or editable element
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'Enter' && canSubmit) {
        e.preventDefault();
        console.log('[InlineCardProgressFooter] Enter key pressed: submitting pack');
        handleSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canSubmit, handleSubmit]);

  async function handleSubmit() {
    const receiptId = Math.random().toString(36).substring(2, 8);
    if (!session?.user) {
      openModal("loginRequired", { receiptId, packTitle: packData.packTitle, submitAllTakes });
      return;
    }
    setIsSubmitting(true);
    const newTakeIDs = await submitAllTakes(receiptId);
    // Temporarily removing URL query updates for userReceiptId
    // Fire-and-forget SMS notification to the user
    try {
      fetch("/api/notifyPackSubmitted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packURL: packData.packURL, packTitle: packData.packTitle, receiptId }),
      });
    } catch {}
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
      <footer className="fixed bottom-0 inset-x-0 bg-white p-2 pt-10 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-gray-200 z-50 md:static md:bg-transparent md:p-0 md:pt-0 md:pb-0 md:border-t-0">
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
        <div style={{ marginTop: "0.75rem" }}>
          <p
            style={{
              margin: "0 0 0.5rem 0",
              fontSize: "0.8rem",
              color: "#666",
              textAlign: "left",
            }}
          >
            {progressPercentage}% complete
          </p>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              backgroundColor: canSubmit ? "#2196f3" : "#ccc",
              color: "#fff",
              padding: "0.25rem 0.75rem",
              border: "none",
              borderRadius: "3px",
              cursor: canSubmit ? "pointer" : "not-allowed",
              width: "100%",
            }}
          >
            {changedCount === 0
              ? (selectedCount === 0 ? "Make Your Takes" : "Make Your Takes")
              : (previousSubmissions ? "Resubmit" : "Submit") + " " + changedCount + " " + (changedCount === 1 ? "Take" : "Takes")}
          </button>
        </div>
      </footer>
    </>
  );
} 