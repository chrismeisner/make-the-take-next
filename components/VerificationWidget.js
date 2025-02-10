// File: /components/VerificationWidget.js
import { useState, useEffect, useRef } from "react";
import InputMask from "react-input-mask";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";

/**
 * Helper: compute side percentages (with +1 offset)
 */
function computeSidePercents(aCount, bCount) {
  const aWithOffset = aCount + 1;
  const bWithOffset = bCount + 1;
  const total = aWithOffset + bWithOffset;
  const aPct = Math.round((aWithOffset / total) * 100);
  const bPct = Math.round((bWithOffset / total) * 100);
  return { aPct, bPct };
}

/**
 * Single Choice subcomponent
 */
function Choice({
  label,
  sideValue,
  percentage,
  isSelected,
  userSide,
  gradedSide,
  showResults,
  propStatus,
  onSelect,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const isUserSide = userSide && userSide === sideValue;
  const clickable = propStatus === "open";

  const fillOpacity = showResults ? (isSelected ? 1 : 0.4) : 0;
  const fillWidth = showResults ? `${percentage}%` : "0%";
  const fillColor = `rgba(219, 234, 254, ${fillOpacity})`;

  let displayedLabel = label;
  if (gradedSide) {
	displayedLabel =
	  sideValue === gradedSide ? `✅ ${displayedLabel}` : `❌ ${displayedLabel}`;
  }
  if (isUserSide) {
	displayedLabel = `🏴‍☠️ ${displayedLabel}`;
  }

  const containerClasses = [
	"relative",
	"mb-2",
	"p-3",
	"rounded-md",
	"transition-colors",
	clickable ? "cursor-pointer" : "cursor-default",
	isSelected ? "border-2 border-blue-500 bg-white" : "border border-gray-300 bg-gray-50",
	isHovered && clickable && !isSelected ? "border-gray-400" : "",
  ].join(" ");

  return (
	<div
	  className={containerClasses}
	  onClick={clickable ? onSelect : undefined}
	  onMouseEnter={() => clickable && setIsHovered(true)}
	  onMouseLeave={() => clickable && setIsHovered(false)}
	>
	  {/* Filling bar */}
	  <div
		style={{
		  position: "absolute",
		  top: 0,
		  left: 0,
		  width: fillWidth,
		  height: "100%",
		  backgroundColor: fillColor,
		  zIndex: 0,
		  transition: "width 0.4s ease",
		}}
	  />
	  <div className="relative z-10">
		{displayedLabel}
		{showResults && (
		  <span className="ml-2 text-sm text-gray-700">({percentage}%)</span>
		)}
	  </div>
	</div>
  );
}

/**
 * PropChoices
 */
function PropChoices({
  propStatus,
  selectedChoice,
  onSelectChoice,
  sideAPct,
  sideBPct,
  sideALabel,
  sideBLabel,
  userSide,
  resultsRevealed,
}) {
  const isOpen = propStatus === "open";
  const showResults = resultsRevealed || !isOpen;

  let gradedSide = "";
  if (propStatus === "gradedA") gradedSide = "A";
  else if (propStatus === "gradedB") gradedSide = "B";

  const choices = [
	{ sideValue: "A", label: sideALabel, pct: sideAPct },
	{ sideValue: "B", label: sideBLabel, pct: sideBPct },
  ];

  return (
	<div className="mb-4">
	  {choices.map((c) => (
		<Choice
		  key={c.sideValue}
		  label={c.label}
		  sideValue={c.sideValue}
		  percentage={c.pct}
		  isSelected={selectedChoice === c.sideValue}
		  userSide={userSide}
		  gradedSide={gradedSide}
		  showResults={showResults}
		  propStatus={propStatus}
		  onSelect={() => onSelectChoice(c.sideValue)}
		/>
	  ))}
	</div>
  );
}

/**
 * PhoneNumberForm => "phone"
 */
function PhoneNumberForm({ phoneNumber, onSubmittedPhone }) {
  const [localPhone, setLocalPhone] = useState(phoneNumber);
  const [error, setError] = useState("");

  async function handleSendCode() {
	setError("");
	try {
	  const resp = await fetch("/api/sendCode", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone: localPhone }),
	  });
	  if (!resp.ok) {
		const errData = await resp.json();
		setError("Failed to send code: " + (errData.error || resp.status));
		return;
	  }
	  onSubmittedPhone(localPhone);
	} catch (err) {
	  setError("An error occurred while sending the code.");
	}
  }

  return (
	<div className="mb-4">
	  <label className="block mb-2 font-semibold text-gray-700">
		Enter Your Phone Number:
	  </label>
	  <div className="flex gap-2">
		<InputMask
		  mask="(999) 999-9999"
		  value={localPhone}
		  onChange={(e) => setLocalPhone(e.target.value)}
		>
		  {() => (
			<input
			  type="tel"
			  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
			  placeholder="(555) 555-1234"
			/>
		  )}
		</InputMask>
		<button
		  onClick={handleSendCode}
		  className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none"
		>
		  Send Code
		</button>
	  </div>
	  {error && <div className="mt-1 text-red-600">{error}</div>}
	</div>
  );
}

/**
 * VerificationForm => "code"
 */
function VerificationForm({ phoneNumber, selectedChoice, propID, onComplete }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleVerify() {
	setError("");
	// 1) signIn with next-auth credentials
	const result = await signIn("credentials", {
	  redirect: false,
	  phone: phoneNumber,
	  code,
	});
	if (!result.ok) {
	  setError("Verification failed: " + (result.error || "Invalid code"));
	  return;
	}
	// 2) Create the take
	try {
	  const takeResp = await fetch("/api/take", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ propID, propSide: selectedChoice }),
	  });
	  const takeData = await takeResp.json();
	  if (!takeData.success) {
		setError(
		  "Error submitting your vote: " + (takeData.error || "Unknown error")
		);
		return;
	  }
	  onComplete(takeData.newTakeID, {
		success: true,
		sideACount: takeData.sideACount,
		sideBCount: takeData.sideBCount,
	  });
	} catch (err) {
	  setError("An error occurred during verification.");
	}
  }

  function handleResend() {
	console.log("[VerificationForm] Resending code for phone:", phoneNumber);
  }

  return (
	<div className="mb-4">
	  <label className="block mb-2 font-semibold text-gray-700">
		Enter Your 6-Digit Code:
	  </label>
	  <div className="flex items-center gap-2">
		<InputMask
		  mask="999999"
		  value={code}
		  onChange={(e) => setCode(e.target.value)}
		>
		  {() => (
			<input
			  type="text"
			  placeholder="123456"
			  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
			/>
		  )}
		</InputMask>
		<button
		  onClick={handleVerify}
		  className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none"
		>
		  Verify
		</button>
		<button
		  onClick={handleResend}
		  className="px-3 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none"
		>
		  Resend
		</button>
	  </div>
	  {error && <div className="mt-1 text-red-600">{error}</div>}
	</div>
  );
}

/**
 * MakeTakeButton
 */
function MakeTakeButton({
  selectedChoice,
  propID,
  onTakeComplete,
  sessionUser,
  alreadyTookSide,
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const userHasExistingTake = !!alreadyTookSide;
  const isSameAsVerified = userHasExistingTake && selectedChoice === alreadyTookSide;
  const disabled = !selectedChoice || isSameAsVerified;
  const buttonLabel = userHasExistingTake ? "Update Take" : "Make The Take";

  async function handleClick() {
	setError("");
	if (!confirming) {
	  setConfirming(true);
	  return;
	}
	try {
	  const resp = await fetch("/api/take", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ propID, propSide: selectedChoice }),
	  });
	  const data = await resp.json();
	  if (!data.success) {
		setError("Error submitting vote: " + (data.error || "Unknown error"));
		setConfirming(false);
		return;
	  }
	  onTakeComplete(data.newTakeID, {
		success: true,
		sideACount: data.sideACount,
		sideBCount: data.sideBCount,
	  });
	  setConfirming(false);
	} catch (err) {
	  setError("An error occurred while submitting your vote.");
	  setConfirming(false);
	}
  }

  return (
	<div className="mt-4">
	  <button
		onClick={handleClick}
		disabled={disabled}
		className={[
		  "px-4 py-2 rounded-md focus:outline-none text-white",
		  disabled
			? "bg-gray-400 cursor-not-allowed"
			: "bg-blue-600 hover:bg-blue-700",
		].join(" ")}
	  >
		{buttonLabel}
	  </button>
	  {confirming && !disabled && (
		<span className="ml-2 text-blue-600">
		  Click again to confirm your take on side “{selectedChoice}”!
		</span>
	  )}
	  {error && <div className="mt-2 text-red-600">{error}</div>}
	</div>
  );
}

/**
 * CompleteStep
 */
function CompleteStep({
  takeID,
  sideACount,
  sideBCount,
  selectedChoice,
  alreadyTookSide,
  propShort,
  sideALabel,
  sideBLabel,
}) {
  if (!takeID) return null;
  const { aPct, bPct } = computeSidePercents(sideACount, sideBCount);

  const takeUrl = `/takes/${takeID}`;
  const tweetText =
	typeof window !== "undefined"
	  ? `I just made my take! Check it out:\n\n${window.location.origin + takeUrl} #MakeTheTake`
	  : "I just made my take! #MakeTheTake";
  const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
	tweetText
  )}`;

  return (
	<div className="mt-4">
	  <h3 className="text-lg font-semibold">Thanks!</h3>
	  <p>Your take was logged successfully.</p>
	  <div className="mt-4 border border-gray-300 p-4 rounded-md">
		<h4 className="font-semibold mb-2">Final Results for {propShort}</h4>
		<PropChoices
		  propStatus="closed"
		  userSide={alreadyTookSide}
		  selectedChoice={selectedChoice}
		  onSelectChoice={() => {}}
		  sideAPct={aPct}
		  sideBPct={bPct}
		  sideALabel={sideALabel}
		  sideBLabel={sideBLabel}
		/>
		<p className="text-sm text-gray-600">
		  Side A Count: {sideACount} | Side B Count: {sideBCount}
		</p>
	  </div>
	  <p className="mt-2 text-sm">
		<Link href={takeUrl} className="text-blue-600 underline">
		  View your new take here
		</Link>
	  </p>
	  <p className="mt-2 text-sm">
		<a
		  href={tweetHref}
		  target="_blank"
		  rel="noreferrer"
		  className="text-blue-600 underline"
		>
		  Tweet this take
		</a>
	  </p>
	</div>
  );
}

/**
 * Main VerificationWidget
 * - The only change is that we now show "propShort" instead of "propTitle".
 */
export default function VerificationWidget({
  embeddedPropID,
  redirectOnSuccess = false,
  onVerificationComplete,
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [resultsRevealed, setResultsRevealed] = useState(false);
  const [propData, setPropData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [takeID, setTakeID] = useState(null);
  const [sideACount, setSideACount] = useState(0);
  const [sideBCount, setSideBCount] = useState(0);
  const [alreadyTookSide, setAlreadyTookSide] = useState(null);
  const [userTakeID, setUserTakeID] = useState(null);

  const alreadyVerifiedCalled = useRef(false);

  // 1) Load the prop data
  useEffect(() => {
	if (!embeddedPropID) return;
	fetch(`/api/prop?propID=${encodeURIComponent(embeddedPropID)}`)
	  .then((res) => res.json())
	  .then((data) => {
		setLoading(false);
		if (data.success) {
		  setPropData(data);
		  setSideACount(data.sideACount || 0);
		  setSideBCount(data.sideBCount || 0);
		} else {
		  console.error("[VerificationWidget] /api/prop error =>", data.error);
		}
	  })
	  .catch((err) => {
		console.error("[VerificationWidget] error =>", err);
		setLoading(false);
	  });
  }, [embeddedPropID]);

  // 2) If logged in => see if user has a latest take
  useEffect(() => {
	if (session && propData?.propID && !alreadyVerifiedCalled.current) {
	  fetch(`/api/userTakes?propID=${propData.propID}`)
		.then((res) => res.json())
		.then((data) => {
		  if (data.success && data.side && data.takeID) {
			setSelectedChoice(data.side);
			setAlreadyTookSide(data.side);
			setUserTakeID(data.takeID);
			setResultsRevealed(true);
			if (onVerificationComplete) {
			  onVerificationComplete();
			  alreadyVerifiedCalled.current = true;
			}
		  }
		})
		.catch((err) => {
		  console.error("[VerificationWidget] error loading userTakes =>", err);
		});
	}
  }, [session, propData, onVerificationComplete]);

  // 3) After successful new take
  function handleComplete(newTakeID, freshData) {
	if (freshData?.success) {
	  setSideACount(freshData.sideACount || 0);
	  setSideBCount(freshData.sideBCount || 0);
	  if (onVerificationComplete && !alreadyVerifiedCalled.current) {
		onVerificationComplete();
		alreadyVerifiedCalled.current = true;
	  }
	}
	if (redirectOnSuccess) {
	  router.push(`/takes/${newTakeID}`);
	} else {
	  setTakeID(newTakeID);
	  setCurrentStep("complete");
	}
  }

  // 4) user picks a side
  function handleSelectChoice(sideValue) {
	setSelectedChoice(sideValue);
	setResultsRevealed(true);
  }

  // 5) if loading or error
  if (loading) {
	return <div className="text-gray-600">Loading proposition...</div>;
  }
  if (!propData?.success) {
	return (
	  <div className="text-red-600">
		Prop not found or error loading prop.
	  </div>
	);
  }

  // 6) Decide if open, graded, or closed
  const propStatus = propData.propStatus || "open";
  const { aPct, bPct } = computeSidePercents(sideACount, sideBCount);
  const totalTakes = sideACount + sideBCount + 2;

  // 7) If user just finished => show CompleteStep
  if (currentStep === "complete") {
	return (
	  <div className="border border-gray-300 p-4 mt-4 rounded-md">
		<div className="mb-2 text-sm text-gray-600">
		  <Link href={`/props/${embeddedPropID}`}>
			View full details for this proposition
		  </Link>
		</div>
		{session?.user && userTakeID && (
		  <div className="mb-4 text-sm text-gray-600">
			<Link href={`/takes/${userTakeID}`}>See your take here</Link>
		  </div>
		)}
		<CompleteStep
		  takeID={takeID}
		  sideACount={sideACount}
		  sideBCount={sideBCount}
		  selectedChoice={selectedChoice}
		  alreadyTookSide={alreadyTookSide}
		  // changed to propShort
		  propShort={propData.propShort || "(Untitled)"}
		  sideALabel={propData.PropSideAShort || "Side A"}
		  sideBLabel={propData.PropSideBShort || "Side B"}
		/>
	  </div>
	);
  }

  // 8) If not open => graded or closed
  if (propStatus !== "open") {
	return (
	  <div className="border border-gray-300 p-4 mt-4 rounded-md">
		<h4 className="text-lg font-semibold">
		  {/* changed to propShort */}
		  {propData.propShort || "(Untitled)"}
		</h4>
		<p className="text-sm text-gray-600">Status: {propStatus}</p>
		<p className="mt-2 text-sm text-gray-600">Total Takes: {totalTakes}</p>
		<PropChoices
		  propStatus={propStatus}
		  selectedChoice={selectedChoice}
		  onSelectChoice={() => {}}
		  sideAPct={aPct}
		  sideBPct={bPct}
		  sideALabel={propData.PropSideAShort || "Side A"}
		  sideBLabel={propData.PropSideBShort || "Side B"}
		  userSide={alreadyTookSide}
		  // no resultsRevealed needed, because not open => always show
		/>
	  </div>
	);
  }

  // 9) Otherwise it's open => normal flow
  return (
	<div className="border border-gray-300 p-4 mt-4 rounded-md">
	  <div className="mb-2 text-sm text-gray-600">
		<Link href={`/props/${embeddedPropID}`}>
		  View full details for this proposition
		</Link>
	  </div>
	  <h4 className="text-lg font-semibold">
		{/* changed to propShort */}
		{propData.propShort || "(Untitled)"}
	  </h4>

	  {session?.user ? (
		<div className="mb-4 text-sm text-blue-600">
		  Logged in as: {session.user.phone}
		  {userTakeID && (
			<div>
			  <Link href={`/takes/${userTakeID}`}>
				See your take here
			  </Link>
			</div>
		  )}
		</div>
	  ) : (
		<div className="mb-4 text-sm text-gray-700">Not logged in</div>
	  )}

	  <PropChoices
		propStatus="open"
		selectedChoice={selectedChoice}
		onSelectChoice={handleSelectChoice}
		sideAPct={aPct}
		sideBPct={bPct}
		sideALabel={propData.PropSideAShort || "Side A"}
		sideBLabel={propData.PropSideBShort || "Side B"}
		userSide={alreadyTookSide}
		resultsRevealed={resultsRevealed}
	  />

	  <p className="text-sm text-gray-600">Total Takes: {totalTakes}</p>

	  {session?.user ? (
		<MakeTakeButton
		  selectedChoice={selectedChoice}
		  propID={propData.propID}
		  onTakeComplete={handleComplete}
		  sessionUser={session.user}
		  alreadyTookSide={alreadyTookSide}
		/>
	  ) : (
		<div className="mt-4">
		  {currentStep === "phone" && (
			<PhoneNumberForm
			  phoneNumber={phoneNumber}
			  onSubmittedPhone={(phone) => {
				setPhoneNumber(phone);
				setCurrentStep("code");
			  }}
			/>
		  )}
		  {currentStep === "code" && (
			<VerificationForm
			  phoneNumber={phoneNumber}
			  selectedChoice={selectedChoice}
			  propID={propData.propID}
			  onComplete={handleComplete}
			/>
		  )}
		</div>
	  )}
	</div>
  );
}
