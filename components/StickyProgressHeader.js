// File: /components/StickyProgressHeader.js
import React from "react";
import { usePackContext } from "../contexts/PackContext";

export default function StickyProgressHeader() {
  const context = usePackContext();
  if (!context) {
	return (
	  <header style={{ ...fallbackStyles }}>
		<h2>Loading header...</h2>
	  </header>
	);
  }

  const { packData, verifiedProps } = context;

  const totalProps = packData.props.length;
  const verifiedCount = verifiedProps.size;
  const progressPercentage =
	totalProps === 0 ? 0 : Math.round((verifiedCount / totalProps) * 100);
  const isComplete = totalProps > 0 && verifiedCount >= totalProps;

  return (
	<header
	  style={{
		position: "fixed", // Use fixed instead of sticky
		bottom: 0, // Stick to the bottom of the screen
		left: 0, // Align to the left
		right: 0, // Align to the right
		backgroundColor: "#f9f9f9",
		zIndex: 999,
		padding: "1rem",
		borderTop: "1px solid #ddd", // Change border to top since it's at the bottom
	  }}
	>
	  <h2 style={{ margin: 0 }}>
		{packData.packTitle}
		{isComplete ? " - All Verified!" : ""}
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
		  }}
		>
		  Verified: {verifiedCount} / {totalProps} ({progressPercentage}%){" "}
		  {isComplete && <span style={{ marginLeft: "0.5rem" }}>✔️</span>}
		</p>
	  </div>
	</header>
  );
}
