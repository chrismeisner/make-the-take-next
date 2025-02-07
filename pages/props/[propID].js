import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useSession } from "next-auth/react";
import VerificationWidget from "../../components/VerificationWidget";
import RelatedProp from "../../components/RelatedProp";

export default function PropDetailPage() {
  const router = useRouter();
  const { propID } = router.query;
  const { data: session, status } = useSession();

  const [propData, setPropData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
	if (!propID) return;
	console.log(`Fetching prop data for propID=${propID}...`);
	setLoading(true);

	fetch(`/api/prop?propID=${encodeURIComponent(propID)}`)
	  .then((res) => res.json())
	  .then((data) => {
		if (!data.success) {
		  console.error("Error loading prop data:", data.error);
		  setError(data.error || "Error loading prop.");
		} else {
		  console.log("Prop data received:", data);
		  setPropData(data);
		  generatePropCover(data.propID);
		}
		setLoading(false);
	  })
	  .catch((err) => {
		console.error("Error fetching prop:", err);
		setError("Could not load prop data.");
		setLoading(false);
	  });
  }, [propID]);

  /**
   * Trigger the generation of the prop cover image
   */
  function generatePropCover(propID) {
	console.log(`Requesting cover image for propID=${propID}...`);
	fetch(`/api/prop-cover/${propID}`)
	  .then(() => console.log(`Cover image generated/served for prop ${propID}`))
	  .catch((err) => console.error("Error generating cover:", err));
  }

  if (loading) return <div>Loading prop...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!propData) return <div>Prop not found.</div>;

  // Construct the cover image URL for social sharing if desired
  const coverImageUrl = `${window.location.origin}/api/prop-cover/${propID}`;
  console.log("Cover image URL:", coverImageUrl);

  // Basic fallback if some fields are missing
  const {
	propTitle = "Untitled Proposition",
	propSummary = "No summary available",
	subjectLogoUrl,
	subjectTitle,
	contentImageUrl,
	createdAt,
	propSubjectID,
  } = propData;

  // We'll use `coverImageUrl` or `contentImageUrl` for og:image.
  // Adjust as needed (maybe prefer contentImageUrl if it exists).
  const ogImageUrl = contentImageUrl || coverImageUrl;

  return (
	<>
	  {/* Dynamic Head block for unique OG tags (title, description, image) */}
	  <Head>
		<title>{propTitle} | Make The Take</title>
		<meta property="og:title" content={propTitle} />
		<meta property="og:description" content={propSummary} />
		<meta property="og:image" content={ogImageUrl} />
		<meta property="og:type" content="article" />

		{/* Optional Twitter Card tags */}
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={propTitle} />
		<meta name="twitter:description" content={propSummary} />
		<meta name="twitter:image" content={ogImageUrl} />
	  </Head>

	  <div style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto" }}>
		{/* Prop Title */}
		<h1>{propTitle}</h1>

		{/* Subject Logo */}
		{subjectLogoUrl && (
		  <img
			src={subjectLogoUrl}
			alt={subjectTitle || "Subject Logo"}
			style={{
			  width: "80px",
			  height: "80px",
			  objectFit: "cover",
			  borderRadius: "4px",
			}}
		  />
		)}

		{/* Main Prop Image */}
		{contentImageUrl && (
		  <div style={{ margin: "1rem 0" }}>
			<img
			  src={contentImageUrl}
			  alt="Prop Content"
			  style={{ width: "100%", maxWidth: "600px", objectFit: "cover" }}
			/>
		  </div>
		)}

		{/* Subject & Created Date */}
		<div style={{ color: "#555", marginBottom: "1rem" }}>
		  {subjectTitle && <p>Subject: {subjectTitle}</p>}
		  <p>Created: {createdAt}</p>
		</div>

		{/* Prop Summary */}
		<p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
		  {propSummary}
		</p>

		{/* Verification Widget for Voting */}
		<section style={{ marginBottom: "1rem" }}>
		  <h3>Vote on This Prop</h3>
		  <VerificationWidget embeddedPropID={propData.propID} />
		</section>

		{/* Related Prop Section */}
		{propSubjectID ? (
		  <section style={{ border: "1px solid #ccc", padding: "1rem" }}>
			<h3>Related Proposition</h3>
			<RelatedProp
			  currentSubjectID={propSubjectID}
			  currentPropID={propData.propID}
			/>
		  </section>
		) : (
		  <p style={{ color: "#999" }}>
			No subject information available for related props.
		  </p>
		)}

		<p style={{ marginTop: "1rem" }}>
		  <Link href="/">Back to Home</Link>
		</p>
	  </div>
	</>
  );
}
