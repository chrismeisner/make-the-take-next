// File: /components/PropCard.js

import { useState, useEffect } from "react";
import { usePackContext } from "../contexts/PackContext";
import VerificationWidget from "./VerificationWidget";
import Link from "next/link";

export default function PropCard({ prop }) {
  const context = usePackContext();
  const verifiedProps = context?.verifiedProps || new Set();
  const handlePropVerified = context?.handlePropVerified || (() => {});
  // Get user's take for this prop, if any
  const userTake = context?.userTakesByProp?.[prop.propID];

  const [verified, setVerified] = useState(verifiedProps.has(prop.propID));

  useEffect(() => {
	setVerified(verifiedProps.has(prop.propID));
  }, [verifiedProps, prop.propID]);

  function handleVerificationComplete() {
	if (!verified) {
	  setVerified(true);
	  handlePropVerified(prop.propID);
	}
  }

  const {
    propShort = "",
    propSummary = "No summary provided",
    propStatus = "open",
  } = prop;
  // Determine pill style based on status
  const statusPillClasses = {
    open: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
    gradedA: "bg-blue-100 text-blue-800",
    gradedB: "bg-purple-100 text-purple-800",
  };
  const pillClass = statusPillClasses[propStatus] || statusPillClasses.closed;

  return (
	<div className="border border-gray-300 rounded-md p-4">
	  {/* Status pill */}
	  <div className="mb-2">
		<span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${pillClass}`}>
		  {propStatus}
		</span>
	  </div>
	  {/* Display the short label prominently */}
	  <p className="text-lg font-semibold mb-2">{propShort}</p>
	  {/* Display the detailed summary underneath */}
	  <p className="text-sm text-gray-600 mb-2">{propSummary}</p>

	  {/* Show user's take if already taken */}
	  {userTake && (
		<>
		  <p className="text-sm text-purple-600 mb-2">
			Your take: {userTake.side}
		  </p>
		  <p className="text-sm mb-2">
			<Link href={`/takes/${userTake.takeID}`} className="text-blue-600 underline">
			  Take Link
			</Link>
		  </p>
		</>
	  )}

	  {/* VerificationWidget */}
	  <div className="mt-4">
		<VerificationWidget
		  embeddedPropID={prop.propID}
		  onVerificationComplete={handleVerificationComplete}
		/>
	  </div>
	</div>
  );
}
