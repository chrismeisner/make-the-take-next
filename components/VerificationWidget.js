// components/VerificationWidget.js

import { useState, useEffect } from "react";
import InputMask from "react-input-mask";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";

/** 
 * 1) Helper to compute side percentages with an offset to avoid 0%
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
 * 2) Choice subcomponent 
 */
function Choice({
  label,
  percentage,
  isSelected,
  isVerified,
  anySideSelected,
  showResults,
  propStatus,
  onSelect,
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Only clickable if the prop is open
  const clickable = propStatus === "open";
  const backgroundColor = !anySideSelected ? "#f9f9f9" : "#ffffff";
  const outlineStyle = isSelected ? "2px solid #3b82f6" : "none";
  const baseBorder = "1px solid #ddd";
  const hoverBorder = "1px solid #aaa";

  const fillOpacity = showResults ? (isSelected ? 1 : 0.4) : 0;
  const fillColor = `rgba(219, 234, 254, ${fillOpacity})`;
  const fillWidth = showResults ? `${percentage}%` : "0%";

  return (
	<div
	  onClick={clickable ? onSelect : undefined}
	  onMouseEnter={() => clickable && setIsHovered(true)}
	  onMouseLeave={() => clickable && setIsHovered(false)}
	  style={{
		position: "relative",
		marginBottom: "0.5rem",
		padding: "1rem",
		cursor: clickable ? "pointer" : "default",
		backgroundColor,
		border: isHovered && clickable ? hoverBorder : baseBorder,
		outline: outlineStyle,
		overflow: "hidden",
		textAlign: "left",
		opacity: clickable ? 1 : 0.8,
		transition: "border-color 0.2s ease",
	  }}
	>
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
	  <div style={{ position: "relative", zIndex: 1 }}>
		{isVerified ? "🏴‍☠️ " : ""}
		{label}
		{showResults && <span style={{ marginLeft: 6 }}>({percentage}%)</span>}
	  </div>
	</div>
  );
}

/** 
 * 3) PropChoices for side A/B 
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
  const anySideSelected = selectedChoice !== "";
  const choices = [
	{ value: "A", label: sideALabel, percentage: sideAPct },
	{ value: "B", label: sideBLabel, percentage: sideBPct },
  ];

  return (
	<div style={{ marginBottom: "1rem" }}>
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
			anySideSelected={anySideSelected}
			showResults={resultsRevealed}
			propStatus={propStatus}
			onSelect={() => onSelectChoice(choice.value)}
		  />
		);
	  })}
	</div>
  );
}

/** 
 * 4) PhoneNumberForm => step "phone"
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
	<div style={{ marginBottom: "1rem" }}>
	  <label style={{ display: "block", marginBottom: "0.5rem" }}>
		Enter Your Phone Number:
	  </label>
	  <div style={{ display: "flex", gap: "0.5rem" }}>
		<InputMask
		  mask="(999) 999-9999"
		  value={localPhone}
		  onChange={(e) => setLocalPhone(e.target.value)}
		>
		  {() => <input type="tel" style={{ flex: 1, padding: "0.5rem" }} />}
		</InputMask>
		<button onClick={handleSendCode} style={{ padding: "0.5rem 1rem" }}>
		  Send Code
		</button>
	  </div>
	  {error && (
		<div style={{ color: "red", marginTop: "0.5rem" }}>{error}</div>
	  )}
	</div>
  );
}

/** 
 * 5) VerificationForm => step "code"
 */
function VerificationForm({ phoneNumber, selectedChoice, propID, onComplete }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function handleVerify() {
	setError("");
	// 1) Verify code
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
		setError("Error submitting your vote: " + (takeData.error || "Unknown error"));
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
	// Optionally trigger resend logic
  }

  return (
	<div style={{ marginBottom: "1rem" }}>
	  <label style={{ display: "block", marginBottom: "0.5rem" }}>
		Enter Your 6-Digit Code:
	  </label>
	  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
		<InputMask
		  mask="999999"
		  value={code}
		  onChange={(e) => setCode(e.target.value)}
		>
		  {() => (
			<input
			  type="text"
			  placeholder="123456"
			  style={{ width: "100px", padding: "0.5rem" }}
			/>
		  )}
		</InputMask>
		<button onClick={handleVerify} style={{ padding: "0.5rem 1rem" }}>
		  Verify
		</button>
		<button onClick={handleResend} style={{ padding: "0.5rem" }}>
		  Resend
		</button>
	  </div>
	  {error && (
		<div style={{ color: "red", marginTop: "0.5rem" }}>{error}</div>
	  )}
	</div>
  );
}

/** 
 * 6) MakeTakeButton
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
	<div style={{ margin: "1rem 0" }}>
	  <button
		onClick={handleClick}
		disabled={disabled}
		style={{
		  backgroundColor: disabled ? "#888" : "#0070f3",
		  color: "#fff",
		  padding: "0.5rem 1rem",
		  cursor: disabled ? "not-allowed" : "pointer",
		}}
	  >
		{buttonLabel}
	  </button>
	  {confirming && !disabled && (
		<span style={{ marginLeft: "0.5rem", color: "blue" }}>
		  Click again to confirm your take on side "{selectedChoice}"!
		</span>
	  )}
	  {error && (
		<div style={{ color: "red", marginTop: "0.5rem" }}>{error}</div>
	  )}
	</div>
  );
}

/** 
 * 7) CompleteStep 
 *  -- We'll add PropChoices here to show bars in the success screen.
 */
function CompleteStep({
  takeID,
  sideACount,
  sideBCount,
  selectedChoice,
  alreadyTookSide,
  propTitle,
  sideALabel,
  sideBLabel,
}) {
  if (!takeID) return null;

  // Recompute final percentages to show the bars
  const { aPct, bPct } = computeSidePercents(sideACount, sideBCount);
  const takeUrl = `/takes/${takeID}`;

  // For the pirate flag, the user’s verified side is `alreadyTookSide`.
  // We show them as selectedChoice if you want the highlight 
  // (or you can also pass selectedChoice to the "isSelected" logic).
  // But typically you'd highlight whichever side they just took, 
  // so we'll pass `selectedChoice` to "isSelected," 
  // and `alreadyTookSide` to "isVerified."

  const tweetText =
	typeof window !== "undefined"
	  ? `I just made my take! Check it out:\n\n${window.location.origin + takeUrl} #MakeTheTake`
	  : "I just made my take! #MakeTheTake";
  const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
	tweetText
  )}`;

  return (
	<div style={{ marginTop: "1rem" }}>
	  <h3>Thanks!</h3>
	  <p>Your take was logged successfully.</p>

	  {/* Show the final bars and highlight */}
	  <div style={{ marginTop: "1rem", border: "1px solid #ccc", padding: "1rem" }}>
		<h4>Final Results for {propTitle}</h4>
		<PropChoices
		  // We pass "closed" so it’s not clickable
		  propStatus="closed"
		  // Since we've completed a verified take,
		  // the user’s verified side is `alreadyTookSide`.
		  alreadyTookSide={alreadyTookSide}
		  selectedChoice={selectedChoice} 
		  resultsRevealed={true}
		  onSelectChoice={() => {}} // No-op
		  sideAPct={aPct}
		  sideBPct={bPct}
		  sideALabel={sideALabel}
		  sideBLabel={sideBLabel}
		/>
		<p>
		  Side A Count: {sideACount} | Side B Count: {sideBCount}
		</p>
	  </div>

	  {/* Link to the newly created take */}
	  <p style={{ marginTop: "0.5rem" }}>
		<Link href={takeUrl} style={{ color: "blue", textDecoration: "underline" }}>
		  View your new take here
		</Link>
	  </p>

	  {/* Tweet link (optional) */}
	  <p style={{ marginTop: "0.5rem" }}>
		<a
		  href={tweetHref}
		  target="_blank"
		  rel="noreferrer"
		  style={{ color: "blue", textDecoration: "underline" }}
		>
		  Tweet this take
		</a>
	  </p>
	</div>
  );
}

/** 
 * 8) Main VerificationWidget 
 *  -- we pass the needed props to CompleteStep so it can show the bars
 */
export default function VerificationWidget({
  embeddedPropID,
  redirectOnSuccess = false,
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

  useEffect(() => {
	if (session && propData?.propID) {
	  fetch(`/api/userTakes?propID=${propData.propID}`)
		.then((res) => res.json())
		.then((data) => {
		  if (data.success && data.side) {
			setSelectedChoice(data.side);
			setAlreadyTookSide(data.side);
			setResultsRevealed(true);
		  }
		})
		.catch((err) => {
		  console.error("Error fetching user take:", err);
		});
	}
  }, [session, propData]);

  function handleComplete(newTakeID, freshData) {
	if (freshData?.success) {
	  setSideACount(freshData.sideACount || 0);
	  setSideBCount(freshData.sideBCount || 0);
	}
	if (redirectOnSuccess) {
	  router.push(`/takes/${newTakeID}`);
	} else {
	  setTakeID(newTakeID);
	  setCurrentStep("complete");
	}
  }

  function handleSelectChoice(sideValue) {
	setSelectedChoice(sideValue);
	setResultsRevealed(true);
  }

  if (loading) {
	return <div>Loading proposition...</div>;
  }
  if (!propData?.success) {
	return <div>Prop not found or error loading prop.</div>;
  }

  const propStatus = propData.propStatus || "open";
  const { aPct, bPct } = computeSidePercents(sideACount, sideBCount);
  const totalTakes = sideACount + sideBCount + 2;

  //  If the user has completed voting, show the success step with the bars
  if (currentStep === "complete") {
	return (
	  <div style={{ border: "1px solid #ccc", padding: "1rem", marginTop: "1rem" }}>
		<CompleteStep
		  takeID={takeID}
		  sideACount={sideACount}
		  sideBCount={sideBCount}
		  selectedChoice={selectedChoice}
		  alreadyTookSide={alreadyTookSide}
		  propTitle={propData.propTitle}
		  sideALabel={propData.PropSideAShort || "Side A"}
		  sideBLabel={propData.PropSideBShort || "Side B"}
		/>
	  </div>
	);
  }

  if (propStatus !== "open") {
	return (
	  <div style={{ border: "1px solid #ccc", padding: "1rem", marginTop: "1rem" }}>
		<h4>{propData.propTitle}</h4>
		<p>Status: {propStatus}</p>
		<p>Total Takes: {totalTakes}</p>
	  </div>
	);
  }

  // Main widget
  return (
	<div style={{ border: "1px solid #ccc", padding: "1rem", marginTop: "1rem" }}>
	  <h4>{propData.propTitle}</h4>
	  {session?.user ? (
		<div style={{ marginBottom: "1rem", color: "#0070f3" }}>
		  Logged in as: {session.user.phone}
		</div>
	  ) : (
		<div style={{ marginBottom: "1rem", color: "#777" }}>Not logged in</div>
	  )}

	  <PropChoices
		propStatus="open"
		selectedChoice={selectedChoice}
		resultsRevealed={resultsRevealed}
		onSelectChoice={handleSelectChoice}
		sideAPct={aPct}
		sideBPct={bPct}
		sideALabel={propData.PropSideAShort || "Side A"}
		sideBLabel={propData.PropSideBShort || "Side B"}
		alreadyTookSide={alreadyTookSide}
	  />

	  <p>Total Takes: {totalTakes}</p>

	  {session?.user ? (
		<MakeTakeButton
		  selectedChoice={selectedChoice}
		  propID={propData.propID}
		  onTakeComplete={handleComplete}
		  sessionUser={session.user}
		  alreadyTookSide={alreadyTookSide}
		/>
	  ) : (
		<div style={{ marginTop: "1rem" }}>
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
