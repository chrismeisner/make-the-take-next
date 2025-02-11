// File: /pages/api/prop-cover/[propID].js
import { createCanvas, loadImage } from "canvas";
import Airtable from "airtable";
import fetch from "node-fetch";

//
// 1) Airtable + Dropbox Setup
//
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const DROPBOX_FOLDER_PATH = "/Make The Take/Covers"; // Adjust to your Dropbox folder

// Node Canvas dimensions + styling
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const FONT_FAMILY = "Helvetica";
const FONT_SIZE = 60;
const LINE_HEIGHT = 70;
const TEXT_MAX_WIDTH = 1000;

export default async function handler(req, res) {
  console.log("[prop-cover] Handler start => Query:", req.query);

  try {
	const { propID } = req.query;
	if (!propID) {
	  console.error("[prop-cover] No propID provided.");
	  return res.status(400).send("Missing propID");
	}

	// 1) Fetch the prop from Airtable
	console.log(`[prop-cover] Looking up propID="${propID}" in Airtable...`);
	const records = await base("Props")
	  .select({
		filterByFormula: `{propID}="${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!records.length) {
	  console.error(`[prop-cover] propID="${propID}" not found in Airtable.`);
	  return res.status(404).send("Prop not found in Airtable");
	}

	const propRecord = records[0];
	const f = propRecord.fields;
	const propShort = f.propShort || `Prop #${propID}`;

	console.log(`[prop-cover] Found record => ID:${propRecord.id}, title:"${propShort}"`);

	// 2) Check if we already have a generated cover
	if (f.propCoverStatus === "generated" && f.propCoverURL) {
	  console.log("[prop-cover] Already generated => redirecting to existing URL =>", f.propCoverURL);
	  return res.redirect(f.propCoverURL);
	}

	// If no existing cover, proceed to generate
	console.log("[prop-cover] Generating new cover for propID =>", propID);

	// 3) Node Canvas => create the image
	const contentImage = f.contentImage || [];
	const contentImageUrl = contentImage[0]?.url;
	console.log("[prop-cover] contentImageUrl =>", contentImageUrl || "(none)");

	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
	const ctx = canvas.getContext("2d");

	// Fill background
	ctx.fillStyle = "#202020";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// Optionally load + grayscale
	if (contentImageUrl) {
	  try {
		console.log("[prop-cover] Loading background image...");
		const bg = await loadImage(contentImageUrl);

		const scale = Math.max(
		  CANVAS_WIDTH / bg.width,
		  CANVAS_HEIGHT / bg.height
		);
		const scaledWidth = bg.width * scale;
		const scaledHeight = bg.height * scale;

		const x = (CANVAS_WIDTH - scaledWidth) / 2;
		const y = (CANVAS_HEIGHT - scaledHeight) / 2;
		ctx.drawImage(bg, x, y, scaledWidth, scaledHeight);

		// Convert entire canvas to grayscale
		console.log("[prop-cover] Converting to grayscale...");
		const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const data = imageData.data;
		for (let i = 0; i < data.length; i += 4) {
		  const r = data[i];
		  const g = data[i + 1];
		  const b = data[i + 2];
		  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
		  data[i] = gray;
		  data[i + 1] = gray;
		  data[i + 2] = gray;
		  // alpha => data[i+3] remains the same
		}
		ctx.putImageData(imageData, 0, 0);
	  } catch (err) {
		console.warn("[prop-cover] Could not load or grayscale background:", err);
	  }
	}

	// 4) 50% black overlay
	ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// 5) Draw text in yellow
	ctx.fillStyle = "#ffff00";
	ctx.textAlign = "left";
	ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
	wrapText(ctx, propShort, 100, 450, TEXT_MAX_WIDTH, LINE_HEIGHT);

	// Convert to PNG buffer
	console.log("[prop-cover] Converting Canvas to PNG buffer...");
	const pngBuffer = canvas.toBuffer("image/png");

	// 6) Upload to Dropbox
	const dropboxFilename = `prop-${propID}.png`;
	console.log(`[prop-cover] Uploading to Dropbox => folder:"${DROPBOX_FOLDER_PATH}", file:"${dropboxFilename}"`);

	// Step A => "files/upload"
	const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
	  method: "POST",
	  headers: {
		Authorization: `Bearer ${DROPBOX_TOKEN}`,
		"Content-Type": "application/octet-stream",
		"Dropbox-API-Arg": JSON.stringify({
		  path: `${DROPBOX_FOLDER_PATH}/${dropboxFilename}`,
		  mode: "overwrite",
		  mute: true,
		}),
	  },
	  body: pngBuffer,
	});

	if (!uploadRes.ok) {
	  const errText = await uploadRes.text();
	  console.error("[prop-cover] Dropbox upload error =>", errText);
	  return res.status(500).send("Error uploading to Dropbox");
	}
	console.log("[prop-cover] Dropbox upload successful!");

	const uploadJson = await uploadRes.json();
	const dropboxPath = uploadJson.path_lower;

	// Step B => create_shared_link_with_settings => to get a public share link
	console.log("[prop-cover] Creating share link for =>", dropboxPath);
	const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
	  method: "POST",
	  headers: {
		Authorization: `Bearer ${DROPBOX_TOKEN}`,
		"Content-Type": "application/json",
	  },
	  body: JSON.stringify({
		path: dropboxPath,
		settings: {
		  requested_visibility: "public",
		},
	  }),
	});

	let finalLink = "";
	if (shareRes.ok) {
	  const shareData = await shareRes.json();
	  finalLink = shareData.url;
	  // Replace ?dl=0 with ?raw=1 => direct image
	  finalLink = finalLink.replace("?dl=0", "?raw=1");
	  console.log("[prop-cover] Received share link =>", finalLink);
	} else {
	  // Possibly the file was already shared => parse error
	  const shareErrText = await shareRes.text();
	  console.warn("[prop-cover] Dropbox share error =>", shareErrText);

	  // fallback link
	  finalLink = "https://www.dropbox.com" + dropboxPath + "?raw=1";
	}

	// 7) Update Airtable => propCoverURL, propCoverStatus = "generated"
	console.log("[prop-cover] Updating Airtable record with finalLink =>", finalLink);
	await base("Props").update([
	  {
		id: propRecord.id,
		fields: {
		  propCoverURL: finalLink,
		  propCoverStatus: "generated",
		},
	  },
	]);
	console.log("[prop-cover] Airtable updated successfully!");

	// 8) Redirect the user to the Dropbox link
	console.log("[prop-cover] Redirecting user to =>", finalLink);
	return res.redirect(finalLink);
  } catch (err) {
	console.error("[prop-cover] Error =>", err);
	return res.status(500).send("Error generating or uploading image");
  }
}

/**
 * Helper function for text wrapping
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let i = 0; i < words.length; i++) {
	const testLine = line + words[i] + " ";
	const { width } = ctx.measureText(testLine);
	if (width > maxWidth && i > 0) {
	  ctx.fillText(line, x, y);
	  line = words[i] + " ";
	  y += lineHeight;
	} else {
	  line = testLine;
	}
  }
  ctx.fillText(line, x, y);
}
