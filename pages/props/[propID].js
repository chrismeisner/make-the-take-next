import React from "react";
import Head from "next/head";
import Link from "next/link";
import { useModal } from "../../contexts/ModalContext";
import VerificationWidget from "../../components/VerificationWidget";
import { useState } from "react";

// import Airtable from "airtable";
// import { createCanvas, loadImage } from "canvas";
// import { storageBucket } from "../../lib/firebaseAdmin";

// 1) Initialize Airtable base
/* TEMP DISABLE: top-level Airtable initialization
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);
*/

export default function PropDetailPage({
  propData,
  coverImageUrl,
  pageUrl,
  associatedPacks,
  eventDetails = null,
  activity = [],
}) {
  if (!propData) {
	return <div style={{ color: "red" }}>No prop data found.</div>;
  }

  const {
	propTitle: rawPropTitle,
	propShort = "",
	propSummary = "No summary provided",
	subjectLogoUrls = [],
	subjectTitles = [],
	contentImageUrl,
	createdAt,
	propID,
  } = propData;
  const displayTitle = rawPropTitle || propShort || "Untitled Proposition";
  const formattedDate = createdAt
	? new Date(createdAt).toLocaleDateString()
	: "Unknown date";

  const { openModal } = useModal();
  // Track the user's take ID to include as ?ref in challenge URL
  const [lastTakeId, setLastTakeId] = useState(null);

  return (
	<>
	  <Head>
		<title>{displayTitle} | Make The Take</title>
		<meta property="og:title" content={displayTitle} />
		<meta property="og:description" content={propSummary} />
		<meta property="og:image" content={coverImageUrl} />
		<meta property="og:type" content="article" />
		<meta property="og:url" content={pageUrl} />
		<link rel="canonical" href={pageUrl} />

		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={displayTitle} />
		<meta name="twitter:description" content={propSummary} />
		<meta name="twitter:image" content={coverImageUrl} />
	  </Head>

  <div style={{ padding: "1rem", maxWidth: "1024px", margin: "0 auto" }}>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Left Column: Content & Related Packs */}
      <div>
        {/* TEMP DISABLE: cover image display
        {coverImageUrl && (
          <div style={{ marginBottom: "1rem", textAlign: "center" }}>
            <img
              src={coverImageUrl}
              alt="Prop Cover"
              style={{ width: "100%", maxWidth: "600px", objectFit: "cover" }}
            />
          </div>
        )}
        */}
        <h1 className="text-3xl font-bold mb-3">{displayTitle}</h1>
        {/* Subject Logos */}
        {subjectLogoUrls.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {subjectLogoUrls.map((logoUrl, index) => (
              <div
                key={index}
                style={{ width: "80px", height: "80px", borderRadius: "4px", overflow: "hidden" }}
              >
                <img
                  src={logoUrl}
                  alt={subjectTitles[index] || "Subject Logo"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
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
        {/* Additional info */}
        <div style={{ color: "#555", marginBottom: "1rem" }}>
          {subjectTitles.length > 0 && <p>Subjects: {subjectTitles.join(", ")}</p>}
          <p>Created: {formattedDate}</p>
        </div>
        {/* Linked Event Details */}
        {eventDetails && (
          <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded">
            <h3 className="text-lg font-semibold mb-1">Event</h3>
            <p className="text-sm text-gray-700">
              {eventDetails.eventTitle} — {new Date(eventDetails.eventTime).toLocaleString()}
            </p>
          </div>
        )}
        <p style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>{propSummary}</p>
        {/* Related Packs */}
        <section className="mt-8">
          <h3 className="text-xl font-semibold mb-2">Related Packs</h3>
          {(!associatedPacks || associatedPacks.length === 0) ? (
            <p className="text-sm text-gray-600">This proposition is not currently in any packs.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {associatedPacks.map((pack) => (
                <PackPreviewCard key={pack.airtableId} pack={pack} />
              ))}
            </div>
          )}
        </section>
        {/* Activity Log */}
        <section className="mt-8">
          <h3 className="text-xl font-semibold mb-2">Activity</h3>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-600">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map(act => (
                <li key={act.id} className="text-sm text-gray-700">
                  <span className="font-medium">{act.profileID}</span> made a take – {new Date(act.createdTime).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/">Back to Home</Link>
          <button
            onClick={() => {
              const base = pageUrl.split("?")[0];
              const ref = lastTakeId || new URL(window.location.href).searchParams.get("ref");
              const challengeUrl = ref ? `${base}?ref=${ref}` : base;
              openModal("challengeShare", { packTitle: displayTitle, picksText: "", challengeUrl });
            }}
            className="text-blue-600 underline ml-4"
          >
            Challenge
          </button>
        </p>
      </div>
      {/* Right Column: Voting Widget */}
      <div>
        <section style={{ marginBottom: "1rem" }}>
          <h3>Vote on This Prop</h3>
          <VerificationWidget
            embeddedPropID={propID}
            onVerificationComplete={(newTakeID) => setLastTakeId(newTakeID)}
          />
        </section>
      </div>
    </div>
  </div>
	</>
  );
}

/**
 * Renders a mini preview card for each pack in the "Available Packs" section
 */
function PackPreviewCard({ pack }) {
  return (
	<div className="border p-4 rounded shadow-sm bg-white">
	  {pack.packPrizeImage && pack.packPrizeImage.length > 0 && (
		<img
		  src={pack.packPrizeImage[0].url}
		  alt="Pack Image"
		  className="w-full h-32 object-cover rounded mb-2"
		/>
	  )}
	  <h4 className="text-lg font-semibold">
		<Link href={`/packs/${pack.packURL}`} className="underline text-blue-600">
		  {pack.packTitle}
		</Link>
	  </h4>
	  {pack.prizeSummary && (
		<p className="text-sm text-gray-600 mt-1">{pack.prizeSummary}</p>
	  )}
	</div>
  );
}

/**
 * getServerSideProps:
 * 1) Fetch the prop record from Airtable by {propID}.
 * 2) If cover not generated, do node-canvas + firebase flow.
 * 3) Because "Packs" is a linked record field on "Props," we read the array of IDs from propRecord.fields.Packs,
 *    then query those pack IDs to get the details.
 */
export async function getServerSideProps({ params, query }) {
  // Initialize Airtable base server-side only
  const Airtable = require('airtable');
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);
  const { propID } = params;
  const baseUrl = process.env.SITE_URL || "http://localhost:3000";
  // Include ref query param if present for challenge tracking
  const pageUrl = `${baseUrl}/props/${propID}${query.ref ? `?ref=${query.ref}` : ''}`;

  console.log(`[PropDetailPage] getServerSideProps => propID="${propID}"`);
  console.log(`[PropDetailPage] Using baseUrl="${baseUrl}" => will fetch prop data`);

  try {
	// 1) Fetch the single prop record
	const propRecords = await base("Props")
	  .select({
		filterByFormula: `{propID} = "${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!propRecords || propRecords.length === 0) {
	  console.error("[PropDetailPage] prop not found in Airtable.");
	  return { notFound: true };
	}

	const propRecord = propRecords[0];
	const f = propRecord.fields;
	const propRecordId = propRecord.id;

	// Build your propData object
	const propData = {
	  propID: f.propID || propID,
	  propTitle: f.propTitle || "Untitled Proposition",
	  propSummary: f.propSummary || "No summary provided",
	  subjectLogoUrls: Array.isArray(f.subjectLogo)
		? f.subjectLogo.map((att) => att.url)
		: [],
	  subjectTitles: f.subjectTitle || [],
	  contentImageUrl: "",
	  createdAt: propRecord._rawJson.createdTime,
	  propCoverStatus: f.propCoverStatus || "",
	  propCoverURL: f.propCoverURL || "",
	};

	// If there's a contentImage array, use the first
	if (Array.isArray(f.contentImage) && f.contentImage.length > 0) {
	  propData.contentImageUrl = f.contentImage[0].url;
	}

	// 2) Possibly generate cover if missing
	let finalCoverImageUrl = propData.propCoverURL;
/* TEMP DISABLE: auto-generate prop cover
if (propData.propCoverStatus !== "generated" || !finalCoverImageUrl) {
  console.log("[PropDetailPage] Generating new cover for propID:", propID);
  try {
    finalCoverImageUrl = await generateAndUploadCover({ propID, fields: f });
    // Update Airtable
    await base("Props").update([
      { id: propRecord.id, fields: { propCoverURL: finalCoverImageUrl, propCoverStatus: "generated" } },
    ]);
  } catch (err) {
    console.error("[PropDetailPage] Error generating cover =>", err);
    finalCoverImageUrl = `${baseUrl}/fallback.png`;
  }
}
*/
	// 3) Because the "Props" table has a linked-record field "Packs," we read that array of IDs
	let associatedPacks = [];
	const linkedPackIDs = f.Packs || [];
	console.log("[PropDetailPage] Found linkedPackIDs =>", linkedPackIDs);

	if (linkedPackIDs.length > 0) {
	  // Build a formula like OR(RECORD_ID()='rec123', RECORD_ID()='rec456', ...)
	  const formula = `OR(${linkedPackIDs
		.map((id) => `RECORD_ID()='${id}'`)
		.join(",")})`;

	  try {
		const packRecords = await base("Packs")
		  .select({
			filterByFormula: formula,
			maxRecords: 50,
		  })
		  .all();

		console.log("[PropDetailPage] packRecords found =>", packRecords.length);

		associatedPacks = packRecords.map((rec) => {
		  const pf = rec.fields;
		  let packPrizeImage = [];
		  if (Array.isArray(pf.packPrizeImage)) {
			packPrizeImage = pf.packPrizeImage.map((img) => ({
			  url: img.url,
			  filename: img.filename,
			}));
		  }
		  return {
			airtableId: rec.id,
			packTitle: pf.packTitle || "Untitled Pack",
			packURL: pf.packURL || "",
			packPrizeImage,
			prizeSummary: pf.prizeSummary || "",
		  };
		});
	  } catch (err) {
		console.error("[PropDetailPage] Error fetching packRecords =>", err);
	  }
	}

	// Fetch linked event details if any
	const linkedEventIDs = f.Event || [];
	let eventDetails = null;
	if (linkedEventIDs.length > 0) {
	  const [eventRec] = await base("Events").select({
		filterByFormula: `RECORD_ID()="${linkedEventIDs[0]}"`,
		maxRecords: 1
	  }).firstPage();
	  if (eventRec) {
		eventDetails = eventRec.fields;
	  }
	}
	// Fetch activity (takes) for this prop
	const takeRecords = await base("Takes").select({
	  filterByFormula: `{propID} = "${propID}"`,
	  maxRecords: 1000
	}).all();
	const activity = takeRecords.map(rec => ({
	  id: rec.id,
	  profileID: rec.fields.profileID || rec.fields.takeMobile || '',
	  createdTime: rec._rawJson.createdTime,
	}));
	// Return everything to the page
	return {
	  props: {
		propData: {
		  ...propData,
		  propCoverURL: finalCoverImageUrl,
		},
		coverImageUrl: finalCoverImageUrl,
		pageUrl,
		associatedPacks,
		eventDetails,
		activity,
	  },
	};
  } catch (error) {
	console.error("[PropDetailPage] Error =>", error);
	return { notFound: true };
  }
}

/**
 * Helper: Node Canvas + Firebase upload
 */
async function generateAndUploadCover({ propID, fields }) {
  console.log("[generateAndUploadCover] Start for propID:", propID);

  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 630;
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  // 1) Fill background
  ctx.fillStyle = "#202020";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 2) If there's a content image, load it + grayscale
  let bgUrl = "";
  if (Array.isArray(fields.contentImage) && fields.contentImage.length > 0) {
	bgUrl = fields.contentImage[0].url;
  }
  if (bgUrl) {
	try {
	  const bg = await loadImage(bgUrl);
	  const scale = Math.max(
		CANVAS_WIDTH / bg.width,
		CANVAS_HEIGHT / bg.height
	  );
	  const scaledWidth = bg.width * scale;
	  const scaledHeight = bg.height * scale;
	  const x = (CANVAS_WIDTH - scaledWidth) / 2;
	  const y = (CANVAS_HEIGHT - scaledHeight) / 2;
	  ctx.drawImage(bg, x, y, scaledWidth, scaledHeight);

	  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	  const data = imageData.data;
	  for (let i = 0; i < data.length; i += 4) {
		const gray =
		  0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
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
