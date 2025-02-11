// File: /pages/api/prop-cover/[propID].js
import { createCanvas, loadImage } from "canvas";
import Airtable from "airtable";
import fetch from "node-fetch";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const DROPBOX_FOLDER_PATH = "/Make The Take/Covers"; // Adjust as needed

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const FONT_FAMILY = "Helvetica";
const FONT_SIZE = 60;
const LINE_HEIGHT = 70;
const TEXT_MAX_WIDTH = 1000;

export default async function handler(req, res) {
  console.log("[prop-cover] Handler start => req.query:", req.query);

  try {
	const { propID } = req.query;
	if (!propID) {
	  console.error("[prop-cover] No propID provided.");
	  return res.status(400).send("Missing propID");
	}

	console.log(`[prop-cover] Fetching Airtable record for propID="${propID}"...`);
	const records = await base("Props")
	  .select({
		filterByFormula: `{propID}="${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!records.length) {
	  console.error(`[prop-cover] Not found => propID="${propID}"`);
	  return res.status(404).send("Prop not found in Airtable");
	}

	const propRecord = records[0];
	const f = propRecord.fields;
	const propShort = f.propShort || `Prop #${propID}`;

	// If we already generated & have a URL, just redirect
	if (f.propCoverStatus === "generated" && f.propCoverURL) {
	  console.log("[prop-cover] Already generated => redirecting to existing URL =>", f.propCoverURL);
	  return res.redirect(f.propCoverURL);
	}

	console.log("[prop-cover] No existing cover => generating a new one...");

	// Node Canvas
	const contentImage = f.contentImage || [];
	const contentImageUrl = contentImage[0]?.url;
	console.log("[prop-cover] Content image URL =>", contentImageUrl || "(none)");

	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#202020";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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

		// Convert to grayscale
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
		}
		ctx.putImageData(imageData, 0, 0);
	  } catch (err) {
		console.warn("[prop-cover] Error loading/grayscaling background =>", err);
	  }
	}

	// 50% black overlay
	ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// Draw the text
	ctx.fillStyle = "#ffff00";
	ctx.textAlign = "left";
	ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
	wrapText(ctx, propShort, 100, 450, TEXT_MAX_WIDTH, LINE_HEIGHT);

	// Convert to PNG
	const pngBuffer = canvas.toBuffer("image/png");
	console.log("[prop-cover] Canvas to buffer complete, size =", pngBuffer.length);

	// -------------- DROPBOX UPLOAD --------------
	const dropboxFilename = `prop-${propID}.png`;
	console.log("[prop-cover] Uploading to Dropbox => path:", `${DROPBOX_FOLDER_PATH}/${dropboxFilename}`);

	// Step A => /files/upload
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

	console.log("[prop-cover] Dropbox upload response =>", uploadRes.status, uploadRes.statusText);
	if (!uploadRes.ok) {
	  const uploadErr = await uploadRes.text();
	  console.error("[prop-cover] Dropbox upload error =>", uploadErr);
	  return res.status(500).send("Error uploading to Dropbox");
	}
	console.log("[prop-cover] Dropbox upload successful!");

	const uploadJson = await uploadRes.json();
	const dropboxPath = uploadJson.path_lower;
	console.log("[prop-cover] file path_lower =>", dropboxPath);

	// Step B => create_shared_link_with_settings
	console.log("[prop-cover] Creating shared link for =>", dropboxPath);
	const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
	  method: "POST",
	  headers: {
		Authorization: `Bearer ${DROPBOX_TOKEN}`,
		"Content-Type": "application/json",
	  },
	  body: JSON.stringify({
		path: dropboxPath,
		settings: { requested_visibility: "public" },
	  }),
	});

	console.log("[prop-cover] shareRes =>", shareRes.status, shareRes.statusText);

	let finalLink = "";
	if (shareRes.ok) {
	  const shareData = await shareRes.json();
	  finalLink = shareData.url.replace("?dl=0", "?raw=1");
	  console.log("[prop-cover] Final share link =>", finalLink);
	} else {
	  const shareErr = await shareRes.text();
	  console.warn("[prop-cover] share link error =>", shareErr);
	  finalLink = "https://www.dropbox.com" + dropboxPath + "?raw=1";
	  console.log("[prop-cover] Using fallback =>", finalLink);
	}

	// --------------- Update Airtable ---------------
	console.log("[prop-cover] Updating Airtable => coverURL:", finalLink);
	await base("Props").update([
	  {
		id: propRecord.id,
		fields: {
		  propCoverURL: finalLink,
		  propCoverStatus: "generated",
		},
	  },
	]);
	console.log("[prop-cover] Airtable update success => saved link!");

	// --------------- redirect to finalLink ---------------
	console.log("[prop-cover] Redirecting =>", finalLink);
	return res.redirect(finalLink);

  } catch (err) {
	console.error("[prop-cover] Exception =>", err);
	return res.status(500).send("Error generating or uploading image");
  }
}

/**
 * Helper to wrap text
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
