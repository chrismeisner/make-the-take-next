import React from "react";
import { usePackContext } from "../contexts/PackContext";

export default function ListProgressFooter() {
  const { packData, verifiedProps } = usePackContext();
  const totalProps = packData.props.length;
  const verifiedCount = verifiedProps.size;
  const progressPercentage = totalProps === 0 ? 0 : Math.round((verifiedCount / totalProps) * 100);
  const isComplete = totalProps > 0 && verifiedCount >= totalProps;

  return (
    <footer
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#f9f9f9",
        padding: "1rem",
        borderTop: "1px solid #ddd",
        zIndex: 999,
      }}
    >
      <h2 style={{ margin: 0 }}>
        {packData.packTitle} {isComplete && " - All Verified!"}
      </h2>
      <div style={{ marginTop: "0.5rem" }}>
        <div
          style={{
            backgroundColor: "#e0e0e0",
            height: "8px",
            borderRadius: "4px",
            overflow: "hidden",
            width: "100%",
          }}
        >
          <div
            style={{
              backgroundColor: isComplete ? "#4caf50" : "#2196f3",
              width: `${progressPercentage}%`,
              height: "100%",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.9rem",
            color: "#666",
            textAlign: "center",
          }}
        >
          Verified: {verifiedCount} / {totalProps} ({progressPercentage}%)
        </p>
      </div>
    </footer>
  );
} 