import React from "react";
import { usePackContext } from "../contexts/PackContext";

export default function CardProgressFooter() {
  const { packData, verifiedProps } = usePackContext();
  const totalProps = packData.props.length;
  const verifiedCount = verifiedProps.size;
  const progressPercentage = totalProps === 0 ? 0 : Math.round((verifiedCount / totalProps) * 100);

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
      <p
        style={{
          margin: "0.25rem 0 0",
          fontSize: "0.8rem",
          color: "#666",
          textAlign: "center",
        }}
      >
        {verifiedCount} / {totalProps} verified
      </p>
    </footer>
  );
} 