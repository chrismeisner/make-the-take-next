// File: /components/PropCard.js
import { useState, useEffect } from "react";
import { usePackContext } from "../contexts/PackContext";
import VerificationWidget from "./VerificationWidget";

export default function PropCard({ prop }) {
  // Retrieve PackContext
  const context = usePackContext();
  const verifiedProps = context ? context.verifiedProps : new Set();
  const handlePropVerified = context ? context.handlePropVerified : () => {};

  // Local state to track if this prop is verified
  const [verified, setVerified] = useState(verifiedProps.has(prop.propID));

  // Sync local 'verified' whenever context changes
  useEffect(() => {
	setVerified(verifiedProps.has(prop.propID));
  }, [verifiedProps, prop.propID]);

  // Callback from VerificationWidget
  function handleVerificationComplete() {
	if (!verified) {
	  setVerified(true);
	  handlePropVerified(prop.propID);
	}
  }

  // If prop.contentImageUrls doesn't exist, default to empty array:
  const { contentImageUrls = [] } = prop;

  return (
	<div className="border border-gray-300 rounded-md p-4">
	  {/* Display the first content image (if any) above the title */}
	  {contentImageUrls.length > 0 && (
		<div className="mb-2">
		  <img
			src={contentImageUrls[0]}
			alt="Prop Content"
			className="w-full max-h-64 object-cover rounded"
		  />
		</div>
	  )}

	  <h3 className="text-2xl font-extrabold mb-1">{prop.propTitle}</h3>
	  <p className="text-sm text-gray-700">{prop.propSummary}</p>

	  <div className="mt-2 text-sm text-gray-600">
		<span className="font-semibold">Status:</span> {prop.propStatus}
	  </div>

	  {verified && (
		<p className="mt-1 text-green-600 text-sm font-semibold">
		  You have verified this proposition.
		</p>
	  )}

	  {/* VerificationWidget has tailwind styling internally, plus the original "filling bar" for each choice */}
	  <div className="mt-4">
		<VerificationWidget
		  embeddedPropID={prop.propID}
		  onVerificationComplete={handleVerificationComplete}
		/>
	  </div>
	</div>
  );
}
