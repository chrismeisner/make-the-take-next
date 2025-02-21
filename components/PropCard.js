// File: /components/PropCard.js

import { useState, useEffect } from "react";
import { usePackContext } from "../contexts/PackContext";
import VerificationWidget from "./VerificationWidget";

export default function PropCard({ prop }) {
  const context = usePackContext();
  const verifiedProps = context ? context.verifiedProps : new Set();
  const handlePropVerified = context ? context.handlePropVerified : () => {};

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
	propSummary = "No summary provided",
	propStatus = "open",
  } = prop;

  return (
	<div className="border border-gray-300 rounded-md p-4">
	  {/* Replace the old "headline" with a less bold style */}
	  <p className="text-lg font-semibold mb-2">{propSummary}</p>

	  {/* Status row */}
	  <div className="mt-2 text-sm text-gray-600">
		<span className="font-semibold">Status:</span> {propStatus}
	  </div>

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
