// pages/props/[propID].js
import Head from "next/head";
import Link from "next/link";
import VerificationWidget from "../../components/VerificationWidget";
import RelatedProp from "../../components/RelatedProp";

/**
 * This page uses getServerSideProps so that we have `propData` at request-time
 * and can set SEO-friendly OG meta tags (title, description, og:image).
 */
export default function PropDetailPage({ propData, coverImageUrl }) {
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

  return (
	<>
	  <Head>
		<title>{propTitle} | Make The Take</title>

		{/* Open Graph (OG) */}
		<meta property="og:title" content={propTitle} />
		<meta property="og:description" content={propSummary} />
		<meta property="og:image" content={coverImageUrl} />
		<meta property="og:type" content="article" />

		{/* Twitter Card */}
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={propTitle} />
		<meta name="twitter:description" content={propSummary} />
		<meta name="twitter:image" content={coverImageUrl} />
	  </Head>

	  <div style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto" }}>
		<h1>{propTitle}</h1>

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

		{contentImageUrl && (
		  <div style={{ margin: "1rem 0" }}>
			<img
			  src={contentImageUrl}
			  alt="Prop Content"
			  style={{ width: "100%", maxWidth: "600px", objectFit: "cover" }}
			/>
		  </div>
		)}

		<div style={{ color: "#555", marginBottom: "1rem" }}>
		  {subjectTitle && <p>Subject: {subjectTitle}</p>}
		  <p>Created: {createdAt}</p>
		</div>

		<p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
		  {propSummary}
		</p>

		{/* Voting Widget */}
		<section style={{ marginBottom: "1rem" }}>
		  <h3>Vote on This Prop</h3>
		  <VerificationWidget embeddedPropID={propID} />
		</section>

		{/* Related Proposition */}
		{propSubjectID ? (
		  <section style={{ border: "1px solid #ccc", padding: "1rem" }}>
			<h3>Related Proposition</h3>
			<RelatedProp
			  currentSubjectID={propSubjectID}
			  currentPropID={propID}
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

export async function getServerSideProps({ params }) {
  const { propID } = params;
  const baseUrl = process.env.SITE_URL || "http://localhost:3000";

  // 1) Fetch the prop data from your existing API
  const response = await fetch(`${baseUrl}/api/prop?propID=${propID}`);
  const data = await response.json();

  if (!data.success) {
	return {
	  notFound: true,
	};
  }

  // 2) Build the dynamic cover image URL for social previews
  //    This references /api/prop-cover/[propID].
  const coverImageUrl = `${baseUrl}/api/prop-cover/${propID}`;

  // Return both the propData and the coverImageUrl to the page
  return {
	props: {
	  propData: data,
	  coverImageUrl,
	},
  };
}
