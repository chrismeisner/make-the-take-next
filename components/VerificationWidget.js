// File: /components/VerificationWidget.js

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { usePackContext } from "../contexts/PackContext";
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
  previewValue,
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Only clickable if the prop is open
  const clickable = propStatus === "open";

  // If showResults => fill part of the container behind the label
  const fillOpacity = showResults ? (isSelected ? 1 : 0.4) : 0;
  const fillWidth = showResults ? `${percentage}%` : "0%";
  const fillColor = `rgba(219, 234, 254, ${fillOpacity})`;

  // Base container: no stroke here, only layout & background
  const containerClasses = [
    "relative",
    "mb-2",
    "p-3",
    "rounded-md",
    "transition-colors",
    clickable ? "cursor-pointer" : "cursor-default",
    isSelected ? "bg-white" : "bg-gray-50",
  ].join(" ");

  // Decide if we show a grading icon (✅ / ❌):
  // If winningSide === sideValue => "✅"; otherwise => "❌".
  // We only do this if propStatus is "gradedA" or "gradedB" (i.e., winningSide is not null).
  let gradingIcon = null;
  if (propStatus === "push") {
    // On a push, show a checkmark on both options
    gradingIcon = "✅";
  } else if (winningSide) {
    // For graded props, show check or cross based on winning side
    gradingIcon = winningSide === sideValue ? "✅" : "❌";
  }

  // Split previewValue into number and bone emoji
  let previewNumber = '';
  let previewBone = '';
  if (previewValue) {
    const boneChar = '🦴';
    const idx = previewValue.indexOf(boneChar);
    if (idx !== -1) {
      previewNumber = previewValue.slice(0, idx).replace(/^\+/, '');
      previewBone = boneChar;
    } else {
      previewNumber = previewValue.replace(/^\+/, '');
    }
  }

  return (
	<div
	  className={containerClasses}
	  onClick={clickable ? onSelect : undefined}
	  onMouseEnter={() => clickable && setIsHovered(true)}
	  onMouseLeave={() => clickable && setIsHovered(false)}
	>
      {/* Fill bar behind everything */}
      <div
        className="rounded-l-md"
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
      {/* Stroke overlay: rendered above fill, below content */}
      <div
        className={`absolute inset-0 rounded-md border pointer-events-none ${
          isSelected ? "border-blue-500" : "border-gray-300"
        } ${isHovered && clickable && !isSelected ? "border-gray-400" : ""}`}
        style={{ zIndex: 1 }}
      />
      {/* Content wrapper */}
      <div className="relative z-10 flex items-center">
    {/* Grading icon, title, and percentage on the left */}
    <div className="flex items-center space-x-2">
      {gradingIcon && <div className="choice-grading-icon">{gradingIcon}</div>}
      <div className="choice-label font-medium">{label}</div>
      {showResults && (
        <div className="choice-percentage text-sm text-gray-700">
          {`${percentage}%`}
        </div>
      )}
    </div>
    <div className="flex-1" />
    {/* Preview value always */}
    {previewValue && (
      <div className="choice-preview-container ml-4 flex items-center">
        <div className="choice-preview-number">{previewNumber}</div>
        <div className="choice-preview-bone ml-1">{previewBone}</div>
      </div>
    )}
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
  choices,
  alreadyTookSide,
}) {
  // Determine the winning side if graded (e.g. "gradedA", "gradedB", etc.) or a push
  let winningSide = null;
  if (propStatus === "push") {
    winningSide = "push";
  } else if (propStatus.startsWith("graded")) {
    winningSide = propStatus.slice(6);
  }

  // Only reveal results (bars + percentages) once the user has taken (or already had taken)
  const shouldShowResults = resultsRevealed && (propStatus !== "open" || !!alreadyTookSide || !!selectedChoice);

  // Use the dynamic choices array passed in (each { value, label, percentage })

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
            previewValue={choice.previewValue}
            isSelected={isSelected}
            isVerified={isVerified}
            showResults={shouldShowResults}
            propStatus={propStatus}
            sideValue={choice.value}
            onSelect={() => onSelectChoice(choice.value)}
            winningSide={winningSide}
          />
        );
      })}
    </div>
  );
}

// Export PropChoices for reuse in CardViewCard
export { PropChoices };

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

  // Normalize autofill/typed numbers to 10-digit US
  const sanitizeUSPhoneInput = (value) => {
    const numeric = String(value || "").replace(/\D/g, "");
    if (numeric.length >= 11 && numeric.startsWith("1")) {
      return numeric.slice(-10);
    }
    return numeric.slice(0, 10);
  };

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
        onChange={(e) => setLocalPhone(sanitizeUSPhoneInput(e.target.value))}
        onBlur={(e) => setLocalPhone(sanitizeUSPhoneInput(e.target.value))}
          type="text"
          inputMode="numeric"
          name="user_phone"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="(555) 555-1234"
		/>

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
		  maskChar=""
		  value={code}
		  onChange={(e) => setCode(e.target.value)}
		  type="text"
		  inputMode="numeric"
		  autoComplete="one-time-code"
		  name="verificationCode"
		  className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
		  placeholder="123456"
		  maxLength={6}
		/>
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
  const packCtx = usePackContext();
  const { data: session } = useSession();
  const [propData, setPropData] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [alreadyTookSide, setAlreadyTookSide] = useState(null);
  const [userTakeID, setUserTakeID] = useState(null);
  const [error, setError] = useState("");
  const [widgetStatus, setWidgetStatus] = useState(STATUS.LOADING);

  // Track when we last fetched prop counts
  const [lastUpdated, setLastUpdated] = useState(null);

  // Steps for phone verification (if user not logged in)
  const [currentStep, setCurrentStep] = useState("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [resultsRevealed, setResultsRevealed] = useState(false);

  // Avoid repeated calls for userTake
  const [fetchedUserTake, setFetchedUserTake] = useState(false);
  // Only call onVerificationComplete once
  const alreadyVerifiedCalled = useRef(false);
  // Reset widget state when switching props in carousel view
  useEffect(() => {
    // Clear previous take info for new prop
    setSelectedChoice("");
    setAlreadyTookSide(null);
    setUserTakeID(null);
    setResultsRevealed(false);
    setWidgetStatus(STATUS.LOADING);
    setFetchedUserTake(false);
    // Allow onVerificationComplete to fire again for new prop
    alreadyVerifiedCalled.current = false;
  }, [embeddedPropID]);

  // 1) Load the single prop from /api/prop
  // Fetch prop and recalc percentages on mount or when propID changes, with 5-min caching
  const CACHE_DURATION_MS = 5 * 60 * 1000;
  const fetchPropData = async (force = false) => {
    const cacheKey = `propCounts_${embeddedPropID}`;
    if (!force) {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        try {
          const { timestamp, data: cachedData } = JSON.parse(raw);
          if (Date.now() - timestamp < CACHE_DURATION_MS) {
            setPropData(cachedData);
            setLastUpdated(new Date(timestamp));
            // Only reveal bars if user already took it or prop is graded/closed
            const propStatusCached = cachedData.propStatus || 'open';
            if (alreadyTookSide || selectedChoice || propStatusCached !== 'open') {
              setResultsRevealed(true);
            } else {
              setResultsRevealed(false);
            }
            return;
          }
        } catch {}
      }
    }
    if (!embeddedPropID) return;
    // Hide bars to animate recede
    setResultsRevealed(false);
    try {
      const resp = await fetch(
        `/api/prop?propID=${encodeURIComponent(embeddedPropID)}`
      );
      const data = await resp.json();
      if (data.success) {
        setPropData(data);
        const now = Date.now();
        setLastUpdated(new Date(now));
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data }));
        } catch {}
        // Only re-show bars if user has taken or it's a graded/closed prop
        const propStatusFetched = data.propStatus || 'open';
        if (alreadyTookSide || selectedChoice || propStatusFetched !== 'open') {
          // Re-show bars to animate fill
          setTimeout(() => {
            setResultsRevealed(true);
          }, 50);
        }
      } else {
        console.error("[VerificationWidget] /api/prop error =>", data.error);
        setWidgetStatus(STATUS.ERROR);
      }
    } catch (err) {
      console.error("[VerificationWidget] loadProp error =>", err);
      setWidgetStatus(STATUS.ERROR);
    }
  };

  useEffect(() => {
    fetchPropData();
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
    // Toggle off if same side clicked again (before submitting)
    if (selectedChoice === sideValue) {
      setSelectedChoice("");
      setResultsRevealed(false);
      // propagate to pack context
      if (packCtx?.handleChoiceSelect) {
        packCtx.handleChoiceSelect(embeddedPropID, sideValue);
      }
    } else {
      setSelectedChoice(sideValue);
      setResultsRevealed(true);
      // propagate to pack context
      if (packCtx?.handleChoiceSelect) {
        packCtx.handleChoiceSelect(embeddedPropID, sideValue);
      }
    }
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
  const showResults = resultsRevealed;
  // Compute dynamic choices: for super-prop (more than 2 options), use raw counts; otherwise add a 'house' vote buffer
  const choicesRaw = propData.choices || [];
  let dynamicChoices;
  if (choicesRaw.length > 2) {
    const totalRaw = choicesRaw.reduce((sum, c) => sum + (c.count || 0), 0);
    dynamicChoices = choicesRaw.map((c) => ({
      value: c.value,
      label: c.label,
      percentage: totalRaw === 0 ? 0 : Math.round((c.count / totalRaw) * 100),
    }));
  } else {
    const houseIncremented = choicesRaw.map((c) => ({ ...c, count: c.count + 1 }));
    const totalHouse = houseIncremented.reduce((sum, c) => sum + c.count, 0);
    dynamicChoices = houseIncremented.map((c) => ({
      value: c.value,
      label: c.label,
      percentage: Math.round((c.count / totalHouse) * 100),
    }));
  }

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

	  {/* Render dynamic choices with new grading icons if prop is graded */}
	  <PropChoices
		propStatus={propStatus}
		selectedChoice={selectedChoice}
		resultsRevealed={showResults}
		onSelectChoice={readOnly ? () => {} : handleSelectChoice}
		choices={dynamicChoices}
		alreadyTookSide={alreadyTookSide}
	  />
	  <p className="text-xs text-gray-500">
		Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "–"}{' '}
		<button onClick={() => fetchPropData(true)} className="underline ml-2">
		  Refresh
		</button>
	  </p>

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
