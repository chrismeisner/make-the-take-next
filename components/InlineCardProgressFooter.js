import React, { useState, useEffect } from "react";
import { usePackContext } from "../contexts/PackContext";
import { useModal } from "../contexts/ModalContext";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function InlineCardProgressFooter() {
  const { packData, selectedChoices, submitAllTakes, userTakesByProp } = usePackContext();
  const { openModal } = useModal();
  const { data: session } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const totalProps = packData.props.length;
  const previousSubmissions = Object.keys(userTakesByProp).length === totalProps;
  const selectedCount = Object.keys(selectedChoices).length;
  const progressPercentage = totalProps === 0 ? 0 : Math.round((selectedCount / totalProps) * 100);
  const allSelected = selectedCount === totalProps;
  const hasChanges = previousSubmissions
    ? Object.entries(selectedChoices).some(
        ([propID, side]) => userTakesByProp[propID]?.side !== side
      )
    : true;
  const canSubmit = allSelected && hasChanges;

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
    // If this is a friend acceptance (ref query present), create or update a challenge record
    if (router.query.ref) {
      try {
        console.log("[InlineCardProgressFooter] Attempting to create/update challenge record with:", {
          packURL: packData.packURL,
          initiatorReceiptId: router.query.ref,
          challengerReceiptId: receiptId,
        });
        await fetch("/api/challenges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packURL: packData.packURL,
            initiatorReceiptId: router.query.ref,
            challengerReceiptId: receiptId,
          }),
        });
        console.log("[InlineCardProgressFooter] Challenge API call completed");
      } catch (err) {
        console.error("[InlineCardProgressFooter] Error creating challenge record:", err);
      }
    }
    router.replace(
      { pathname: router.pathname, query: { ...router.query, userReceiptId: receiptId } },
      undefined,
      { shallow: true }
    );
    openModal("packCompleted", { packTitle: packData.packTitle, receiptId, newTakeIDs });
    setIsSubmitting(false);
  }

  return (
    <>
      {isSubmitting && (
        <div className="fixed inset-0 bg-black opacity-50 z-40 flex items-center justify-center">
          <div className="text-white text-lg">Submitting...</div>
        </div>
      )}
      <footer
        style={{
          backgroundColor: "#ffffff",
          padding: "0.5rem",
          paddingTop: "2rem", // extra space above the progress bar
        }}
      >
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
          <p
            style={{
              margin: "0",
              fontSize: "0.8rem",
              color: "#666",
              textAlign: "left",
            }}
          >
            {selectedCount} / {totalProps} selected
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
            }}
          >
            {previousSubmissions ? "Resubmit" : "Submit"}
          </button>
        </div>
      </footer>
    </>
  );
} 