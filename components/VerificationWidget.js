// File: /components/VerificationWidget.js

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import InputMask from "react-input-mask";

/**
 * Widget status constants
 */
const STATUS = {
  LOADING: "loading",
  MAKE_THE_TAKE: "make_the_take",
  SUBMITTING: "submitting",
  ERROR: "error",
  TAKE_MADE: "take_made",
};

/**
 * Renders a status label with color-coded text.
 * If status === TAKE_MADE and userTakeID is set, "Take Made" is a link to /takes/[userTakeID].
 */
function StatusIndicator({ status, userTakeID }) {
  let label;
  let colorClass;

  switch (status) {
	case STATUS.LOADING:
	  label = "Loading...";
	  colorClass = "text-blue-600";
	  break;
	case STATUS.MAKE_THE_TAKE:
	  label = "Make The Take";
	  colorClass = "text-green-600";
	  break;
	case STATUS.SUBMITTING:
	  label = "Submitting...";
	  colorClass = "text-orange-600";
	  break;
	case STATUS.ERROR:
	  label = "Error";
	  colorClass = "text-red-600";
	  break;
	case STATUS.TAKE_MADE:
	  colorClass = "text-purple-600";
	  if (userTakeID) {
		label = (
		  <Link href={`/takes/${userTakeID}`} className="underline text-inherit">
			Take Made
		  </Link>
		);
	  } else {
		label = "Take Made";
	  }
	  break;
	default:
	  label = "Unknown";
	  colorClass = "text-gray-600";
	  break;
  }

  return <span className={`font-medium ${colorClass}`}>{label}</span>;
}

/**
 * Single Choice (side A or B) with a fill bar if showResults is true.
 * Also shows a grading icon ("✅" / "❌") if prop is graded.
 */
function Choice({
  label,
  percentage,
  isSelected,
  isVerified,
  showResults,
  propStatus,
  sideValue,
  onSelect,
  // New prop: which side is correct if graded
  winningSide,
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Only clickable if the prop is open
  const clickable = propStatus === "open";

  // If showResults => fill part of the container behind the label
  const fillOpacity = showResults ? (isSelected ? 1 : 0.4) : 0;
  const fillWidth = showResults ? `${percentage}%` : "0%";
  const fillColor = `rgba(219, 234, 254, ${fillOpacity})`;

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

  // Decide if we show a grading icon (✅ / ❌):
  // If winningSide === sideValue => "✅"; otherwise => "❌".
  // We only do this if propStatus is "gradedA" or "gradedB" (i.e., winningSide is not null).
  let gradingIcon = null;
  if (winningSide) {
	gradingIcon = winningSide === sideValue ? "✅" : "❌";
  }

  return (
	<div
	  className={containerClasses}
	  onClick={clickable ? onSelect : undefined}
	  onMouseEnter={() => clickable && setIsHovered(true)}
	  onMouseLeave={() => clickable && setIsHovered(false)}
	>
	  {/* Fill bar behind the label */}
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
	  <div className="relative z-10 flex items-center">
		{/* If there's a grading icon, show it to the left */}
		{gradingIcon && <span className="mr-1">{gradingIcon}</span>}

		<span>
		  {label}
		  {/* If showResults => also show the percentage, plus the "pirate" 🏴‍☠️ if isVerified */}
		  {showResults && (
			<>
			  <span className="ml-2 text-sm text-gray-700">({percentage}%)</span>
			  {isVerified && <span className="ml-2">🏴‍☠️</span>}
			</>
		  )}
		</span>
	  </div>
	</div>
  );
}

/**
 * Renders both sides (A and B) with dynamic percentages from sideACount / sideBCount.
 */
function PropChoices({
  propStatus,
  selectedChoice,
  resultsRevealed,
  onSelectChoice,
  sideAPct,
  sideBPct,
  sideALabel,
  sideBLabel,
  alreadyTookSide,
}) {
  // If prop is "gradedA" => side A is correct
  // If prop is "gradedB" => side B is correct
  // Otherwise => null
  let winningSide = null;
  if (propStatus === "gradedA") {
	winningSide = "A";
  } else if (propStatus === "gradedB") {
	winningSide = "B";
  }

  const choices = [
	{ value: "A", label: sideALabel, percentage: sideAPct },
	{ value: "B", label: sideBLabel, percentage: sideBPct },
  ];

  return (
	<div className="mb-4">
	  {choices.map((choice) => {
		const isSelected = selectedChoice === choice.value;
		const isVerified = alreadyTookSide === choice.value;

		return (
		  <Choice
			key={choice.value}
			label={choice.label}
			percentage={choice.percentage}
			isSelected={isSelected}
			isVerified={isVerified}
			showResults={resultsRevealed}
			propStatus={propStatus}
			sideValue={choice.value}
			onSelect={() => onSelectChoice(choice.value)}
			winningSide={winningSide} // pass which side is correct if graded
		  />
		);
	  })}
	</div>
  );
}

/**
 * PhoneNumberForm => collects phone # for a logged-out user to request a code
 * using "(999) 999-9999" mask (no +1 prefix).
 */
function PhoneNumberForm({
  phoneNumber,
  onSubmittedPhone,
  selectedChoice,
  setWidgetStatus,
}) {
  const [localPhone, setLocalPhone] = useState(phoneNumber || "");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSendCode() {
	setError("");
	setIsSending(true);
	try {
	  setWidgetStatus(STATUS.SUBMITTING);

	  // If your backend expects E164, you might parse localPhone -> +1XXXXXXXXXX
	  const resp = await fetch("/api/sendCode", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone: localPhone }),
	  });
	  if (!resp.ok) {
		const errData = await resp.json();
		setError("Failed to send code: " + (errData.error || resp.status));
		setWidgetStatus(STATUS.ERROR);
		return;
	  }

	  // Next step
	  onSubmittedPhone(localPhone);
	  setWidgetStatus(STATUS.MAKE_THE_TAKE);
	} catch (err) {
	  console.error("[PhoneNumberForm] handleSendCode =>", err);
	  setError("An error occurred while sending the code.");
	  setWidgetStatus(STATUS.ERROR);
	} finally {
	  setIsSending(false);
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
		  alwaysShowMask
		  value={localPhone}
		  onChange={(e) => setLocalPhone(e.target.value)}
		>
		  {() => (
			<input
			  type="tel"
			  inputMode="numeric" // numeric keypad on mobile
			  pattern="[0-9]*"
			  autoComplete="tel"
			  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
			  placeholder="(555) 555-1234"
			/>
		  )}
		</InputMask>

		<button
		  onClick={handleSendCode}
		  disabled={!selectedChoice || isSending}
		  className={[
			"px-4 py-2 rounded-md focus:outline-none text-white",
			!selectedChoice || isSending
			  ? "bg-gray-400 cursor-not-allowed"
			  : "bg-blue-600 hover:bg-blue-700",
		  ].join(" ")}
		>
		  {isSending ? "Sending..." : "Send Code"}
		</button>
	  </div>
	  {error && <div className="mt-1 text-red-600">{error}</div>}
	</div>
  );
}

/**
 * VerificationForm => user enters a 6-digit code with "999999" mask and maskChar="" to avoid blocked keystrokes.
 */
function VerificationForm({
  phoneNumber,
  selectedChoice,
  propID,
  onComplete,
  setWidgetStatus,
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function handleVerify() {
	setError("");
	setIsVerifying(true);
	setWidgetStatus(STATUS.SUBMITTING);
	try {
	  // signIn with phone + code
	  const result = await signIn("credentials", {
		redirect: false,
		phone: phoneNumber,
		code,
	  });
	  if (!result.ok) {
		setError("Verification failed: " + (result.error || "Invalid code"));
		setWidgetStatus(STATUS.ERROR);
		return;
	  }

	  // Create the new take
	  const takeResp = await fetch("/api/take", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ propID, propSide: selectedChoice }),
	  });
	  const takeData = await takeResp.json();
	  if (!takeData.success) {
		setError(
		  "Error submitting your take: " + (takeData.error || "Unknown error")
		);
		setWidgetStatus(STATUS.ERROR);
		return;
	  }

	  onComplete(takeData.newTakeID, { success: true });
	  setWidgetStatus(STATUS.TAKE_MADE);
	} catch (err) {
	  console.error("[VerificationForm] handleVerify =>", err);
	  setError("An error occurred while verifying your code.");
	  setWidgetStatus(STATUS.ERROR);
	} finally {
	  setIsVerifying(false);
	}
  }

  async function handleResend() {
	setError("");
	setIsResending(true);
	try {
	  const resp = await fetch("/api/sendCode", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone: phoneNumber }),
	  });
	  if (!resp.ok) {
		const errData = await resp.json();
		setError("Failed to resend code: " + (errData.error || resp.status));
		setWidgetStatus(STATUS.ERROR);
	  }
	} catch (err) {
	  console.error("[VerificationForm] handleResend =>", err);
	  setError("An error occurred while resending the code.");
	  setWidgetStatus(STATUS.ERROR);
	} finally {
	  setIsResending(false);
	}
  }

  return (
	<div className="mb-4">
	  <label className="block mb-2 font-semibold text-gray-700">
		Enter Your 6-Digit Code:
	  </label>
	  <div className="flex items-center gap-2">
		<InputMask
		  mask="999999"
		  maskChar="" // Important for desktop keystrokes
		  value={code}
		  onChange={(e) => setCode(e.target.value)}
		>
		  {() => (
			<input
			  type="text"
			  inputMode="numeric"
			  pattern="[0-9]*"
			  autoComplete="one-time-code"
			  name="verificationCode"
			  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
			  placeholder="123456"
			  maxLength={6}
			/>
		  )}
		</InputMask>
		<button
		  onClick={handleVerify}
		  disabled={isVerifying || code.length < 6}
		  className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none disabled:bg-gray-400"
		>
		  {isVerifying ? "Verifying..." : "Verify"}
		</button>
		<button
		  onClick={handleResend}
		  disabled={isResending}
		  className="px-3 py-2 text-sm text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none"
		>
		  {isResending ? "Resending..." : "Resend"}
		</button>
	  </div>
	  {error && <div className="mt-1 text-red-600">{error}</div>}
	</div>
  );
}

/**
 * The main VerificationWidget
 * - Now shows "✅" or "❌" next to the side label if prop is graded (gradedA or gradedB).
 */
export default function VerificationWidget({
  embeddedPropID,
  onVerificationComplete,
}) {
  const { data: session } = useSession();
  const [propData, setPropData] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [alreadyTookSide, setAlreadyTookSide] = useState(null);
  const [userTakeID, setUserTakeID] = useState(null);
  const [error, setError] = useState("");
  const [widgetStatus, setWidgetStatus] = useState(STATUS.LOADING);

  // Steps for phone verification (if user not logged in)
  const [currentStep, setCurrentStep] = useState("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resultsRevealed, setResultsRevealed] = useState(false);

  // Avoid repeated calls for userTake
  const [fetchedUserTake, setFetchedUserTake] = useState(false);

  // Only call onVerificationComplete once
  const alreadyVerifiedCalled = useRef(false);

  // 1) Load the single prop from /api/prop
  useEffect(() => {
	if (!embeddedPropID) return;

	async function loadProp() {
	  try {
		const resp = await fetch(
		  `/api/prop?propID=${encodeURIComponent(embeddedPropID)}`
		);
		const data = await resp.json();
		if (data.success) {
		  setPropData(data);
		} else {
		  console.error("[VerificationWidget] /api/prop error =>", data.error);
		  setWidgetStatus(STATUS.ERROR);
		}
	  } catch (err) {
		console.error("[VerificationWidget] loadProp error =>", err);
		setWidgetStatus(STATUS.ERROR);
	  }
	}
	loadProp();
  }, [embeddedPropID]);

  // 2) If user is logged in & we haven't fetched userTake => do it once
  useEffect(() => {
	if (!session || !propData?.propID) return;
	if (fetchedUserTake) return;

	async function loadUserTake() {
	  try {
		const res = await fetch(`/api/userTakes?propID=${propData.propID}`);
		const data = await res.json();
		if (data.success && data.side && data.takeID) {
		  // user already has a verified take
		  setSelectedChoice(data.side);
		  setAlreadyTookSide(data.side);
		  setUserTakeID(data.takeID);
		  setResultsRevealed(true);
		  setWidgetStatus(STATUS.TAKE_MADE);

		  if (onVerificationComplete && !alreadyVerifiedCalled.current) {
			onVerificationComplete();
			alreadyVerifiedCalled.current = true;
		  }
		} else {
		  setWidgetStatus(STATUS.MAKE_THE_TAKE);
		}
	  } catch (err) {
		console.error("[VerificationWidget] loadUserTake error =>", err);
		setWidgetStatus(STATUS.ERROR);
	  } finally {
		setFetchedUserTake(true);
	  }
	}
	loadUserTake();
  }, [session, propData, fetchedUserTake, onVerificationComplete]);

  // If prop data is loaded & user is not logged in => "MAKE_THE_TAKE" if status was LOADING
  useEffect(() => {
	if (propData && !session?.user && widgetStatus === STATUS.LOADING) {
	  setWidgetStatus(STATUS.MAKE_THE_TAKE);
	}
  }, [propData, session, widgetStatus]);

  /**
   * Called after a phone verification completes
   */
  function handleVerifyComplete(newTakeID) {
	setAlreadyTookSide(selectedChoice);
	setUserTakeID(newTakeID);
	setResultsRevealed(true);
	setWidgetStatus(STATUS.TAKE_MADE);

	if (onVerificationComplete && !alreadyVerifiedCalled.current) {
	  onVerificationComplete();
	  alreadyVerifiedCalled.current = true;
	}
  }

  /**
   * Create/Update the user's take if they're logged in
   */
  async function createLatestTake() {
	setError("");
	setWidgetStatus(STATUS.SUBMITTING);
	try {
	  const resp = await fetch("/api/take", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ propID: propData.propID, propSide: selectedChoice }),
	  });
	  const data = await resp.json();
	  if (!data.success) {
		setError("Error submitting take: " + (data.error || "Unknown error"));
		setWidgetStatus(STATUS.ERROR);
	  } else {
		setAlreadyTookSide(selectedChoice);
		setUserTakeID(data.newTakeID);
		setResultsRevealed(true);
		setWidgetStatus(STATUS.TAKE_MADE);

		// Update local sideACount / sideBCount
		setPropData((prev) => {
		  if (!prev) return prev;
		  return {
			...prev,
			sideACount: data.sideACount,
			sideBCount: data.sideBCount,
		  };
		});

		if (onVerificationComplete && !alreadyVerifiedCalled.current) {
		  onVerificationComplete();
		  alreadyVerifiedCalled.current = true;
		}
	  }
	} catch (err) {
	  console.error("[VerificationWidget] createLatestTake =>", err);
	  setError("An error occurred while submitting your take.");
	  setWidgetStatus(STATUS.ERROR);
	}
  }

  function handleSelectChoice(sideValue) {
	setSelectedChoice(sideValue);
	setResultsRevealed(true);
  }

  // If the prop data is not loaded or there's an error
  if (!propData) {
	return (
	  <div className="border border-gray-300 p-4 rounded-md">
		<p className="text-sm mb-2">
		  Status: <StatusIndicator status={widgetStatus} userTakeID={userTakeID} />
		</p>
		{widgetStatus === STATUS.ERROR && (
		  <p className="text-red-600">Error loading proposition.</p>
		)}
	  </div>
	);
  }

  if (!propData?.success) {
	return (
	  <div className="border border-gray-300 p-4 rounded-md text-red-600">
		Prop not found or error loading prop.
	  </div>
	);
  }

  // Check the propStatus for "gradedA"/"gradedB" etc.
  const propStatus = propData.propStatus || "open";
  const readOnly = propStatus !== "open";
  const showResults = readOnly || resultsRevealed;

  const sideACount = propData.sideACount || 0;
  const sideBCount = propData.sideBCount || 0;
  const total = sideACount + sideBCount;
  const sideAPct = total === 0 ? 50 : Math.round((sideACount / total) * 100);
  const sideBPct = 100 - sideAPct;

  const hasVerifiedTake = !!alreadyTookSide;
  const buttonLabel = hasVerifiedTake ? "Update Take" : "Make This Take";

  let buttonDisabled = !selectedChoice;
  if (hasVerifiedTake && selectedChoice === alreadyTookSide) {
	buttonDisabled = true;
  }

  return (
	<div className="border border-gray-300 p-4 rounded-md">
	  <h4 className="text-lg font-semibold">
		{propData.propShort || propData.propTitle}
	  </h4>

	  <p className="text-sm my-2">
		Status: <StatusIndicator status={widgetStatus} userTakeID={userTakeID} />
	  </p>

	  {session?.user ? (
		<div className="mb-2 text-sm text-blue-600">
		  Logged in as: {session.user.phone}
		</div>
	  ) : (
		<div className="mb-2 text-sm text-gray-700">Not logged in</div>
	  )}

	  {/* Render choice A/B with new grading icons if prop is graded */}
	  <PropChoices
		propStatus={propStatus}
		selectedChoice={selectedChoice}
		resultsRevealed={showResults}
		onSelectChoice={readOnly ? () => {} : handleSelectChoice}
		sideAPct={sideAPct}
		sideBPct={sideBPct}
		sideALabel={propData.PropSideAShort || "Side A"}
		sideBLabel={propData.PropSideBShort || "Side B"}
		alreadyTookSide={alreadyTookSide}
	  />

	  {readOnly && (
		<p className="mt-2 text-gray-500 italic">
		  This proposition is no longer open for new takes.
		</p>
	  )}

	  {/* If user is logged in & prop is open => show action button */}
	  {session?.user && !readOnly && (
		<button
		  onClick={createLatestTake}
		  disabled={buttonDisabled}
		  className={[
			"mt-2 px-4 py-2 text-white rounded",
			!buttonDisabled
			  ? "bg-blue-600 hover:bg-blue-700"
			  : "bg-gray-400 cursor-not-allowed",
		  ].join(" ")}
		>
		  {buttonLabel}
		</button>
	  )}

	  {/* If user is not logged in => phone verification flow */}
	  {!readOnly && !session?.user && (
		<div className="mt-4">
		  {currentStep === "phone" && (
			<PhoneNumberForm
			  phoneNumber={phoneNumber}
			  selectedChoice={selectedChoice}
			  onSubmittedPhone={(phone) => {
				setPhoneNumber(phone);
				setCurrentStep("code");
			  }}
			  setWidgetStatus={setWidgetStatus}
			/>
		  )}
		  {currentStep === "code" && (
			<VerificationForm
			  phoneNumber={phoneNumber}
			  selectedChoice={selectedChoice}
			  propID={propData.propID}
			  onComplete={(newTakeID, { success }) => {
				if (success) {
				  handleVerifyComplete(newTakeID);
				}
			  }}
			  setWidgetStatus={setWidgetStatus}
			/>
		  )}
		</div>
	  )}

	  {error && <p className="mt-2 text-red-600">{error}</p>}
	</div>
  );
}
