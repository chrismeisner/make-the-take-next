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

  // Destructure any new fields from the prop object
  const {
	contentImageUrls = [],
	contentLinks = [], // e.g. [{ title: 'ESPN', url: 'https://espn.com' }, ...]
  } = prop;

  return (
	<div className="border border-gray-300 rounded-md p-4">
	  {/* If there's a contentImage, show it */}
	  {contentImageUrls.length > 0 && (
		<div className="mb-2">
		  <img
			src={contentImageUrls[0]}
			alt="Prop Content"
			className="w-full max-h-64 object-cover rounded"
		  />
		</div>
	  )}

	  {/* Larger & bolder title */}
	  <h3 className="text-2xl font-extrabold mb-1">{prop.propTitle}</h3>
	  <p className="text-sm text-gray-700">{prop.propSummary}</p>

	  <div className="mt-2 text-sm text-gray-600">
		<span className="font-semibold">Status:</span> {prop.propStatus}
	  </div>

	  {/* Display the contentLinks if present */}
	  {contentLinks.length > 0 && (
		<div className="mt-3">
		  <h4 className="text-sm font-semibold mb-1">Related Links:</h4>
		  <ul className="list-disc list-inside pl-1">
			{contentLinks.map((linkObj, idx) => (
			  <li key={idx}>
				<a
				  href={linkObj.url}
				  target="_blank"
				  rel="noopener noreferrer"
				  className="text-blue-600 underline"
				>
				  {/* If there's no title, fallback to "Open link" */}
				  {linkObj.title || "Open link"}
				</a>
			  </li>
			))}
		  </ul>
		</div>
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
