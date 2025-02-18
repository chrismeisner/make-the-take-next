// File: /components/VerificationWidget.js

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/router";
import Link from "next/link";
import InputMask from "react-input-mask";

/**
 * 0) Widget Status Constants
 *    - Replaces "READY" with "MAKE_THE_TAKE"
 *    - Adds "TAKE_MADE"
 */
const STATUS = {
  LOADING: "loading",
  MAKE_THE_TAKE: "make_the_take",
  SUBMITTING: "submitting",
  ERROR: "error",
  TAKE_MADE: "take_made",
};

/**
 * A simple status indicator that shows color-coded text depending on the current widget status.
 * If status is TAKE_MADE and we have a userTakeID, "Take Made" is a clickable link to /takes/[userTakeID].
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
	  // If we have a takeID, make the text a link
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
 * 1) Choice subcomponent: Renders an individual choice option with a fill bar.
 *    (Pirate flag is displayed to the right of the percentage if user has verified that side.)
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
}) {
  const [isHovered, setIsHovered] = useState(false);
  // Only clickable if the proposition is "open"
  const clickable = propStatus === "open";

  // Decide bar fill
  const fillOpacity = showResults ? (isSelected ? 1 : 0.4) : 0;
  const fillWidth = showResults ? `${percentage}%` : "0%";
  const fillColor = `rgba(219, 234, 254, ${fillOpacity})`;

  // Build container classes
  const containerClasses = [
	"relative",
	"mb-2",
	"p-3",
	"rounded-md",
	"transition-colors",
	clickable ? "cursor-pointer" : "cursor-default",
	isSelected
	  ? "border-2 border-blue-500 bg-white"
	  : "border border-gray-300 bg-gray-50",
	isHovered && clickable && !isSelected ? "border-gray-400" : "",
  ].join(" ");

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
	  <div className="relative z-10">
		{/* Label */}
		{label}
		{/* If showing results, display (XX%) and pirate if verified */}
		{showResults && (
		  <>
			<span className="ml-2 text-sm text-gray-700">({percentage}%)</span>
			{isVerified && <span className="ml-2">🏴‍☠️</span>}
		  </>
		)}
	  </div>
	</div>
  );
}

/**
 * 2) PropChoices: Renders both side A and side B, uses <Choice> above.
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
  const choices = [
	{
	  value: "A",
	  label: sideALabel,
	  percentage: sideAPct,
	},
	{
	  value: "B",
	  label: sideBLabel,
	  percentage: sideBPct,
	},
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
		  />
		);
	  })}
	</div>
  );
}

/**
 * 3) PhoneNumberForm: The step to collect user's phone number before sending a code.
 */
function PhoneNumberForm({
  phoneNumber,
  onSubmittedPhone,
  selectedChoice,
  setWidgetStatus,
}) {
  const [localPhone, setLocalPhone] = useState(phoneNumber);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSendCode() {
	setError("");
	setIsSending(true);

	try {
	  setWidgetStatus(STATUS.SUBMITTING);

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

	  onSubmittedPhone(localPhone);
	  setWidgetStatus(STATUS.MAKE_THE_TAKE);
	} catch (err) {
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
		  value={localPhone}
		  onChange={(e) => setLocalPhone(e.target.value)}
		>
		  {() => (
			<input
			  type="tel"
			  name="phone"
			  autoComplete="tel"
			  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
			  placeholder="(555) 555-1234"
			  maxLength={14}
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
 * 4) VerificationForm: Step to enter the 6-digit code and verify.
 *    After verification, we create the take in /api/take.
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
	  // 1) Verify code via NextAuth
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

	  // 2) Create the take
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

	  // 3) Tell parent we are done. We'll pass back the newTakeID
	  onComplete(takeData.newTakeID, { success: true });
	  // So the widget can link "Take Made" -> /takes/[newTakeID]
	  setWidgetStatus(STATUS.TAKE_MADE);
	} catch (err) {
	  setError("An error occurred during verification.");
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
		  value={code}
		  onChange={(e) => setCode(e.target.value)}
		>
		  {() => (
			<input
			  type="text"
			  name="verificationCode"
			  autoComplete="one-time-code"
			  inputMode="numeric"
			  pattern="[0-9]*"
			  maxLength={6}
			  placeholder="123456"
			  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
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
 * 5) Main VerificationWidget:
 *    - Loads prop data
 *    - Checks if user already has a take
 *    - Shows bars with initial percentages
 *    - If the user is not logged in, phone + code steps
 *    - If the user is logged in, automatically create / update the take on side select
 *    - Does not recalc percentages after a new take
 *    - Includes a status line (color-coded).
 *    - "MAKE_THE_TAKE" or "TAKE_MADE" states are used in place of "READY".
 *    - When TAKE_MADE, the status text becomes a link ( /takes/[takeID] ) if userTakeID is present.
 */
export default function VerificationWidget({
  embeddedPropID,
  onVerificationComplete,
}) {
  const { data: session } = useSession();
  const router = useRouter();

  const [propData, setPropData] = useState(null);

  // Keep track of the user's side selection
  const [selectedChoice, setSelectedChoice] = useState("");
  const [alreadyTookSide, setAlreadyTookSide] = useState(null);

  // Reintroducing userTakeID so we can link to /takes/[userTakeID]
  const [userTakeID, setUserTakeID] = useState(null);

  const alreadyVerifiedCalled = useRef(false);

  // Steps for phone verification if user is not logged in
  const [currentStep, setCurrentStep] = useState("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resultsRevealed, setResultsRevealed] = useState(false);

  const [error, setError] = useState("");

  // Track widget status with our new statuses
  const [widgetStatus, setWidgetStatus] = useState(STATUS.LOADING);

  // 1) Load prop data from server
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
		  // We'll decide in a moment if it's MAKE_THE_TAKE or TAKE_MADE
		} else {
		  console.error("[VerificationWidget] /api/prop error =>", data.error);
		  setWidgetStatus(STATUS.ERROR);
		}
	  } catch (err) {
		console.error("[VerificationWidget] error =>", err);
		setWidgetStatus(STATUS.ERROR);
	  }
	}
	loadProp();
  }, [embeddedPropID]);

  // 2) If the user is logged in, check if they already made a take
  useEffect(() => {
	if (!session || !propData?.propID || alreadyVerifiedCalled.current) return;

	async function loadUserTake() {
	  try {
		const res = await fetch(`/api/userTakes?propID=${propData.propID}`);
		const data = await res.json();
		if (data.success && data.side && data.takeID) {
		  // We have an existing take
		  setSelectedChoice(data.side);
		  setAlreadyTookSide(data.side);
		  setUserTakeID(data.takeID); // store the existing ID
		  setResultsRevealed(true);

		  // If the user has a verified take, set TAKE_MADE
		  setWidgetStatus(STATUS.TAKE_MADE);

		  // Fire callback once
		  if (onVerificationComplete) {
			onVerificationComplete();
			alreadyVerifiedCalled.current = true;
		  }
		} else {
		  // If they are logged in but have no take yet
		  setWidgetStatus(STATUS.MAKE_THE_TAKE);
		}
	  } catch (err) {
		console.error("[VerificationWidget] error =>", err);
		setWidgetStatus(STATUS.ERROR);
	  }
	}
	loadUserTake();
  }, [session, propData, onVerificationComplete]);

  // If not logged in but we have propData, set "MAKE_THE_TAKE" after load
  useEffect(() => {
	if (propData && !session?.user && widgetStatus === STATUS.LOADING) {
	  setWidgetStatus(STATUS.MAKE_THE_TAKE);
	}
  }, [propData, session, widgetStatus]);

  // 3) For logged in users: we immediately submit the take on side selection
  async function submitTake(choice) {
	setError("");
	setWidgetStatus(STATUS.SUBMITTING);

	try {
	  const resp = await fetch("/api/take", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ propID: propData.propID, propSide: choice }),
	  });
	  const data = await resp.json();
	  if (!data.success) {
		setError("Error submitting take: " + (data.error || "Unknown error"));
		setWidgetStatus(STATUS.ERROR);
	  } else {
		// They have now made a take
		setSelectedChoice(choice);
		setAlreadyTookSide(choice);

		// NEW: store the newTakeID for the link
		setUserTakeID(data.newTakeID);

		setResultsRevealed(true);
		setWidgetStatus(STATUS.TAKE_MADE);

		if (onVerificationComplete && !alreadyVerifiedCalled.current) {
		  onVerificationComplete();
		  alreadyVerifiedCalled.current = true;
		}
	  }
	} catch (err) {
	  setError("An error occurred while submitting your vote.");
	  setWidgetStatus(STATUS.ERROR);
	}
  }

  // 4) Called when user picks side
  function handleSelectChoice(sideValue) {
	setSelectedChoice(sideValue);
	setResultsRevealed(true);

	if (session?.user) {
	  // If logged in, auto-submit
	  submitTake(sideValue);
	}
  }

  // 5) Called after verifying code for non-logged in user.
  //    We get the newTakeID from the VerificationForm's onComplete callback.
  function handleVerifyComplete(newTakeID) {
	setAlreadyTookSide(selectedChoice);
	setResultsRevealed(true);

	// store for the link
	setUserTakeID(newTakeID);

	setWidgetStatus(STATUS.TAKE_MADE);

	if (onVerificationComplete && !alreadyVerifiedCalled.current) {
	  onVerificationComplete();
	  alreadyVerifiedCalled.current = true;
	}
  }

  // If we haven't loaded the prop or encountered an error, let's show the status
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

  // If the prop is not open, user can't change their side
  const propStatus = propData.propStatus || "open";
  const readOnly = propStatus !== "open";

  // We'll show results if the prop is closed, or if user has picked a side
  const showResults = readOnly || resultsRevealed;

  // Compute bars from original counts. Do not update these later.
  const sideACount = propData.sideACount || 0;
  const sideBCount = propData.sideBCount || 0;
  const aWithOffset = sideACount + 1;
  const bWithOffset = sideBCount + 1;
  const total = aWithOffset + bWithOffset;
  const sideAPct = Math.round((aWithOffset / total) * 100);
  const sideBPct = Math.round((bWithOffset / total) * 100);

  return (
	<div className="border border-gray-300 p-4 rounded-md">
	  <h4 className="text-lg font-semibold">
		{propData.propShort || propData.propTitle}
	  </h4>

	  {/* Show status line here, passing userTakeID so TAKE_MADE can be clickable */}
	  <p className="text-sm my-2">
		Status: <StatusIndicator status={widgetStatus} userTakeID={userTakeID} />
	  </p>

	  {/* If logged in, display user phone */}
	  {session?.user ? (
		<div className="mb-2 text-sm text-blue-600">
		  Logged in as: {session.user.phone}
		</div>
	  ) : (
		<div className="mb-2 text-sm text-gray-700">Not logged in</div>
	  )}

	  {/* Show the bar choices, using the initial percentages */}
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

	  {/* If prop is closed, show a notice */}
	  {readOnly && (
		<p className="mt-2 text-gray-500 italic">
		  This proposition is no longer open for new takes.
		</p>
	  )}

	  {/* For logged-out users, phone verify flow */}
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
