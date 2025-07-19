import React from "react";
import { usePackContext } from "../contexts/PackContext";
import { useModal } from "../contexts/ModalContext";

export default function CardProgressFooter() {
  const { packData, selectedChoices, submitAllTakes } = usePackContext();
  const { openModal } = useModal();
  const totalProps = packData.props.length;
  const selectedCount = Object.keys(selectedChoices).length;
  const progressPercentage = totalProps === 0 ? 0 : Math.round((selectedCount / totalProps) * 100);
  const allSelected = selectedCount === totalProps;

  // Handle click: submit takes then show confirmation modal
  async function handleSubmit() {
    await submitAllTakes();
    openModal("packCompleted", { packTitle: packData.packTitle });
  }

  return (
    <footer
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#ffffff",
        padding: "0.5rem",
        borderTop: "1px solid #eee",
        zIndex: 999,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
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
          disabled={!allSelected}
          style={{
            backgroundColor: allSelected ? '#2196f3' : '#ccc',
            color: '#fff',
            padding: '0.25rem 0.75rem',
            border: 'none',
            borderRadius: '3px',
            cursor: allSelected ? 'pointer' : 'not-allowed',
          }}
        >
          Submit
        </button>
      </div>
    </footer>
  );
} 