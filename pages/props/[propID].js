// File: /pages/props/[propID].js
import Head from "next/head";
import Link from "next/link";
import VerificationWidget from "../../components/VerificationWidget";
import RelatedProp from "../../components/RelatedProp";

/**
 * PropDetailPage displays a proposition with dynamic Open Graph and Twitter meta tags.
 * Ensure that the SITE_URL environment variable is correctly set in production.
 */
export default function PropDetailPage({ propData, coverImageUrl, pageUrl }) {
  if (!propData) {
	return <div style={{ color: "red" }}>No prop data found.</div>;
  }

  const {
	propTitle = "Untitled Proposition",
	propSummary = "No summary provided",
	subjectLogoUrl,
	subjectTitle,
	contentImageUrl,
	createdAt,
	propSubjectID,
	propID,
  } = propData;

  // Format date if available
  const formattedDate = createdAt ? new Date(createdAt).toLocaleDateString() : "Unknown date";

  return (
	<>
	  <Head>
		<title>{propTitle} | Make The Take</title>
		{/* Dynamic Open Graph Tags */}
		<meta property="og:title" content={propTitle} />
		<meta property="og:description" content={propSummary} />
		<meta property="og:image" content={coverImageUrl} />
		<meta property="og:type" content="article" />
		<meta property="og:url" content={pageUrl} />
		<link rel="canonical" href={pageUrl} />

		{/* Dynamic Twitter (X) Tags */}
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={propTitle} />
		<meta name="twitter:description" content={propSummary} />
		<meta name="twitter:image" content={coverImageUrl} />
	  </Head>

	  <div style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto" }}>
		{/* Make the proposition title bigger, like an H1 */}
		<h1 className="text-3xl font-bold mb-3">{propTitle}</h1>

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

		{/* Content Image */}
		{contentImageUrl && (
		  <div style={{ margin: "1rem 0" }}>
			<img
			  src={contentImageUrl}
			  alt="Prop Content"
			  style={{ width: "100%", maxWidth: "600px", objectFit: "cover" }}
			/>
		  </div>
		)}

		{/* Subject title and Created date */}
		<div style={{ color: "#555", marginBottom: "1rem" }}>
		  {subjectTitle && <p>Subject: {subjectTitle}</p>}
		  <p>Created: {formattedDate}</p>
		</div>

		{/* Summary */}
		<p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
		  {propSummary}
		</p>

		{/* Vote widget */}
		<section style={{ marginBottom: "1rem" }}>
		  <h3>Vote on This Prop</h3>
		  <VerificationWidget embeddedPropID={propID} />
		</section>

		{/* Related prop(s) */}
		{propSubjectID ? (
		  <section style={{ border: "1px solid #ccc", padding: "1rem" }}>
			<h3>Related Proposition</h3>
			<RelatedProp currentSubjectID={propSubjectID} currentPropID={propID} />
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

export async function getServerSideProps({ params }) {
  const { propID } = params;
  // Ensure that SITE_URL is correctly set in production.
  const baseUrl = process.env.SITE_URL || "http://localhost:3000";
  // Build the page URL for canonical and og:url tags.
  const pageUrl = `${baseUrl}/props/${propID}`;

  console.log(`[PropDetailPage] getServerSideProps => propID="${propID}"`);
  console.log(`[PropDetailPage] Using baseUrl="${baseUrl}" => will fetch prop data & build cover URL`);

  try {
	// 1) Fetch the prop data from your API
	const propApiUrl = `${baseUrl}/api/prop?propID=${propID}`;
	console.log(`[PropDetailPage] Fetching prop data from => ${propApiUrl}`);
	const response = await fetch(propApiUrl);
	const data = await response.json();

	if (!data.success) {
	  console.error(`[PropDetailPage] /api/prop returned error =>`, data.error);
	  return { notFound: true };
	}
	console.log("[PropDetailPage] Received prop data =>", data.propID, data.propTitle);

	// 2) Build the dynamic cover image URL for social previews => /api/prop-cover/<propID>
	// This is the route that might log into Dropbox or skip if already generated
	const coverImageUrl = `${baseUrl}/api/prop-cover/${propID}`;
	console.log(`[PropDetailPage] Will use coverImageUrl => ${coverImageUrl}`);

	return {
	  props: {
		propData: data,
		coverImageUrl,
		pageUrl,
	  },
	};
  } catch (error) {
	console.error("[PropDetailPage] Error fetching prop data =>", error);
	return { notFound: true };
  }
}
