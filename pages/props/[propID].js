import React from "react";
import Head from "next/head";
import Link from "next/link";
import VerificationWidget from "../../components/VerificationWidget";

// -- NEW IMPORTS FOR DIRECT COVER GENERATION --
import Airtable from "airtable";
import { createCanvas, loadImage } from "canvas";
import { storageBucket } from "../../lib/firebaseAdmin";

// Initialize Airtable base
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);
 
/**
 * PropDetailPage displays a proposition with dynamic OG/Twitter meta tags,
 * plus a phone-verification voting widget.
 *
 * We now generate the cover image inline (via Node Canvas + Firebase)
 * if `propCoverStatus` is not "generated".
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
  const formattedDate = createdAt
	? new Date(createdAt).toLocaleDateString()
	: "Unknown date";

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
		{/* Optionally display the final or newly generated cover at top */}
		{coverImageUrl && (
		  <div style={{ marginBottom: "1rem", textAlign: "center" }}>
			<img
			  src={coverImageUrl}
			  alt="Prop Cover"
			  style={{ width: "100%", maxWidth: "600px", objectFit: "cover" }}
			/>
		  </div>
		)}

		{/* Title */}
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

		{/* Subject + Created date */}
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

		<p style={{ marginTop: "1rem" }}>
		  <Link href="/">Back to Home</Link>
		</p>
	  </div>
	</>
  );
}

/**
 * getServerSideProps:
 * - Fetches prop data from Airtable directly.
 * - If cover not generated, creates a Node Canvas image, uploads to Firebase,
 *   updates Airtable, then uses the resulting URL in the OG tags & top-of-page <img>.
 */
export async function getServerSideProps({ params }) {
  const { propID } = params;
  const baseUrl = process.env.SITE_URL || "http://localhost:3000";
  const pageUrl = `${baseUrl}/props/${propID}`;

  console.log(`[PropDetailPage] getServerSideProps => propID="${propID}"`);
  console.log(`[PropDetailPage] Using baseUrl="${baseUrl}" => will fetch prop data`);

  try {
	// 1) Fetch the prop record from Airtable:
	const records = await base("Props")
	  .select({
		filterByFormula: `{propID} = "${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!records || records.length === 0) {
	  console.error("[PropDetailPage] prop not found in Airtable.");
	  return { notFound: true };
	}

	const record = records[0];
	const f = record.fields;

	const propData = {
	  propID: f.propID || propID,
	  propTitle: f.propTitle || "Untitled Proposition",
	  propSummary: f.propSummary || "No summary provided",
	  subjectLogoUrl: "",
	  subjectTitle: f.subjectTitle || "",
	  contentImageUrl: "",
	  createdAt: record._rawJson.createdTime,
	  propSubjectID: f.propSubjectID || "",
	  propCoverStatus: f.propCoverStatus || "",
	  propCoverURL: f.propCoverURL || "",
	};

	// 2) If there's a subjectLogo array, use the first
	if (Array.isArray(f.subjectLogo) && f.subjectLogo.length > 0) {
	  propData.subjectLogoUrl = f.subjectLogo[0].url;
	}
	// If there's a contentImage array, use the first
	if (Array.isArray(f.contentImage) && f.contentImage.length > 0) {
	  propData.contentImageUrl = f.contentImage[0].url;
	}

	// 3) If cover is missing or not "generated," generate now
	let finalCoverImageUrl = propData.propCoverURL;
	if (propData.propCoverStatus !== "generated" || !finalCoverImageUrl) {
	  console.log("[PropDetailPage] Generating new cover for propID:", propID);
	  try {
		finalCoverImageUrl = await generateAndUploadCover({
		  propID,
		  fields: f,
		});
		// Update Airtable
		await base("Props").update([
		  {
			id: record.id,
			fields: {
			  propCoverURL: finalCoverImageUrl,
			  propCoverStatus: "generated",
			},
		  },
		]);
	  } catch (err) {
		console.error("[PropDetailPage] Error generating cover =>", err);
		// fallback to some default if generation fails
		finalCoverImageUrl = `${baseUrl}/fallback.png`;
	  }
	}

	// 4) Return data to the page
	return {
	  props: {
		propData: {
		  ...propData,
		  // The final updated cover, for display
		  propCoverURL: finalCoverImageUrl,
		},
		coverImageUrl: finalCoverImageUrl,
		pageUrl,
	  },
	};
  } catch (error) {
	console.error("[PropDetailPage] Error =>", error);
	return { notFound: true };
  }
}

/**
 * Helper: Node Canvas + Firebase upload
 * This replicates the logic from your old /api/prop-cover approach,
 * but runs inline in getServerSideProps so we avoid the redirect flow.
 */
async function generateAndUploadCover({ propID, fields }) {
  console.log("[generateAndUploadCover] Start for propID:", propID);

  // Config
  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 630;
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  // 1) Fill background
  ctx.fillStyle = "#202020";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 2) If there's a content image, load it and grayscale
  let bgUrl = "";
  if (Array.isArray(fields.contentImage) && fields.contentImage.length > 0) {
	bgUrl = fields.contentImage[0].url;
  }
  if (bgUrl) {
	try {
	  const bg = await loadImage(bgUrl);
	  // Scale to fill 1200x630
	  const scale = Math.max(
		CANVAS_WIDTH / bg.width,
		CANVAS_HEIGHT / bg.height
	  );
	  const scaledWidth = bg.width * scale;
	  const scaledHeight = bg.height * scale;
	  const x = (CANVAS_WIDTH - scaledWidth) / 2;
	  const y = (CANVAS_HEIGHT - scaledHeight) / 2;
	  ctx.drawImage(bg, x, y, scaledWidth, scaledHeight);

	  // Convert to grayscale
	  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	  const data = imageData.data;
	  for (let i = 0; i < data.length; i += 4) {
		const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
		data[i] = gray;
		data[i + 1] = gray;
		data[i + 2] = gray;
	  }
	  ctx.putImageData(imageData, 0, 0);
	} catch (err) {
	  console.warn("[generateAndUploadCover] Could not load background =>", err);
	}
  }

  // 3) Dark overlay
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 4) Write text in yellow
  ctx.fillStyle = "#ffff00";
  ctx.font = "bold 60px Helvetica";
  ctx.textAlign = "left";
  const propShort = fields.propShort || `Prop #${propID}`;
  ctx.fillText(propShort, 100, 300);

  // 5) Convert to buffer
  const pngBuffer = canvas.toBuffer("image/png");

  // 6) Upload to Firebase
  const fileName = `prop-${propID}.png`;
  const folder = "covers";
  const firebasePath = `${folder}/${fileName}`;

  console.log("[generateAndUploadCover] Uploading =>", firebasePath);
  const file = storageBucket.file(firebasePath);
  const writeStream = file.createWriteStream({
	metadata: { contentType: "image/png" },
	resumable: false,
  });

  // Wait for upload
  writeStream.end(pngBuffer);
  await new Promise((resolve, reject) => {
	writeStream.on("finish", resolve);
	writeStream.on("error", reject);
  });

  // Make public
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;
  console.log("[generateAndUploadCover] publicUrl =>", publicUrl);

  return publicUrl;
}
