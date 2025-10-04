import React, { useState, useEffect } from "react";
import { usePackContext } from "../contexts/PackContext";
import { useModal } from "../contexts/ModalContext";
import { useSession } from "next-auth/react";
 

export default function InlineCardProgressFooter() {
  const { packData, selectedChoices, submitAllTakes, userTakesByProp } = usePackContext();
  const { openModal } = useModal();
  const { data: session } = useSession();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
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

  // Determine if current slide (prop) has a selection
  const hasSelectionOnCurrent = (() => {
    // slide 0 is the cover; only props map from index 1..N
    if (!Array.isArray(packData.props)) return false;
    if (currentSlideIndex <= 0 || currentSlideIndex > packData.props.length) return false;
    const prop = packData.props[currentSlideIndex - 1];
    const propID = prop?.propID;
    if (!propID) return false;
    const chosen = selectedChoices[propID] ?? userTakesByProp[propID]?.side;
    return Boolean(chosen);
  })();

  // Compute overall takes made across the pack (include existing takes as well as new selections)
  const takenCount = Array.isArray(packData.props)
    ? packData.props.reduce((acc, p) => {
        const chosen = selectedChoices[p.propID] ?? userTakesByProp[p.propID]?.side;
        return acc + (chosen ? 1 : 0);
      }, 0)
    : 0;
  // Button is fully blue only when there are changes to submit
  const isFullProgress = progressPercentage === 100;
  const submitBgColor = isFullProgress ? '#7c3aed' : (canSubmit ? '#1d4ed8' : '#cccccc');
  const submitTextColor = '#ffffff';
  const buttonLabel = changedCount > 0
    ? `Submit ${changedCount} ${changedCount === 1 ? 'Take' : 'Takes'}`
    : 'Submit Takes';

  // Derive counter text for current slide (0 = cover)
  const counterText = (currentSlideIndex ?? 0) === 0
    ? 'Swipe to Play'
    : `${currentSlideIndex} of ${totalProps}`;

  // Determine if we're on the last prop slide (index equals totalProps)
  const isOnLastProp = currentSlideIndex >= totalProps && totalProps > 0;
  // Determine if we're on the cover slide
  const isOnCover = (currentSlideIndex ?? 0) === 0;
  // Has the user made all takes across the pack? (existing takes + new selections)
  const hasTakenAll = totalProps > 0 && takenCount >= totalProps;
  // If logged in and all takes are made, keep navigation active (except Prev on cover)
  const forceButtonsActive = Boolean(session?.user) && hasTakenAll;

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

  // Listen for carousel slide changes so we can style Next accordingly
  useEffect(() => {
    const onSlide = (e) => {
      const idx = e?.detail?.index ?? 0;
      setCurrentSlideIndex(idx);
    };
    window.addEventListener('packCarouselSlide', onSlide);
    // Initialize from global if available to catch first render
    try {
      if (typeof window !== 'undefined' && typeof window.__packCarouselActiveIndex === 'number') {
        setCurrentSlideIndex(window.__packCarouselActiveIndex);
      }
    } catch {}
    return () => window.removeEventListener('packCarouselSlide', onSlide);
  }, []);

  async function handleSubmit() {
    const receiptId = Math.random().toString(36).substring(2, 8);
    if (!session?.user) {
      openModal("loginRequired", { receiptId, packTitle: packData.packTitle, submitAllTakes });
      return;
    }
    setIsSubmitting(true);
    const newTakeIDs = await submitAllTakes(receiptId);
    // Temporarily removing URL query updates for userReceiptId
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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => {
              try { window.dispatchEvent(new Event('packCarouselPrev')); } catch {}
            }}
            disabled={isOnCover}
            style={{
              backgroundColor: (forceButtonsActive && !isOnCover) ? '#2196f3' : '#e5e7eb',
              color: (forceButtonsActive && !isOnCover) ? '#ffffff' : (isOnCover ? '#9ca3af' : '#111827'),
              padding: '0.25rem 0.75rem',
              border: 'none',
              borderRadius: '4px',
              cursor: isOnCover ? 'not-allowed' : 'pointer',
            }}
          >
            Prev
          </button>
          <div
            style={{
              margin: '0 0.75rem',
              color: '#666666',
              fontSize: '0.85rem',
              lineHeight: 1.25,
              minWidth: '5rem',
              textAlign: 'center',
            }}
            aria-live="polite"
          >
            {counterText}
          </div>
          <button
            type="button"
            onClick={() => {
              try { window.dispatchEvent(new Event('packCarouselNext')); } catch {}
            }}
            disabled={!forceButtonsActive && isOnLastProp}
            style={{
              backgroundColor: forceButtonsActive ? '#2196f3' : ((isOnLastProp) ? '#e5e7eb' : (hasSelectionOnCurrent ? '#2196f3' : '#e5e7eb')),
              color: forceButtonsActive ? '#ffffff' : ((isOnLastProp) ? '#9ca3af' : (hasSelectionOnCurrent ? '#ffffff' : '#111827')),
              padding: '0.25rem 0.75rem',
              border: 'none',
              borderRadius: '4px',
              cursor: (!forceButtonsActive && isOnLastProp) ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
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
            textAlign: "center",
            }}
          >
            {progressPercentage}% complete
          </p>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              backgroundColor: submitBgColor,
              color: submitTextColor,
              padding: "0.25rem 0.75rem",
              border: "none",
              borderRadius: "3px",
              cursor: canSubmit ? "pointer" : "not-allowed",
              width: "100%",
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </footer>
    </>
  );
} 