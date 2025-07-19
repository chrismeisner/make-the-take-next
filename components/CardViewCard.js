import { useState, useEffect } from "react";
import Link from "next/link";
import { usePackContext } from "../contexts/PackContext";
import VerificationWidget from "./VerificationWidget";

export default function CardViewCard({ prop }) {
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
    propSummary = "No summary provided",
    propStatus = "open",
  } = prop;

  return (
    <div className="bg-white border border-gray-300 rounded-md shadow-lg p-4 w-full max-w-[600px] mx-auto">
      {/* Replace the old "headline" with a less bold style */}
      <p className="text-lg font-semibold mb-2">{propSummary}</p>

      {/* Show user's take if already taken */}
      {userTake && (
        <p className="text-sm text-purple-600 mb-2">
          Your take: {userTake.side}
        </p>
      )}

      {/* Status row */}
      <div className="mt-2 text-sm text-gray-600">
        <span className="font-semibold">Status:</span> {propStatus}
      </div>
      {/* See prop detail link */}
      <div className="mt-1 text-sm">
        <Link href={`/props/${prop.propID}`} className="text-blue-600 underline">
          See prop detail
        </Link>
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