// File: pages/api/prop-cover/[propID].js
import { createCanvas, loadImage } from "canvas";
import Airtable from "airtable";
import { storageBucket } from "../../../lib/firebaseAdmin";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const FONT_FAMILY = "Helvetica";
const FONT_SIZE = 60;
const LINE_HEIGHT = 70;
const TEXT_MAX_WIDTH = 1000;

export default async function handler(req, res) {
  console.log("[prop-cover] Handler => req.query:", req.query);

  try {
	const { propID } = req.query;
	if (!propID) {
	  console.error("[prop-cover] No propID provided.");
	  return res.status(400).send("Missing propID");
	}

	// 1) Lookup Airtable
	const records = await base("Props")
	  .select({
		filterByFormula: `{propID}="${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!records.length) {
	  console.error(`[prop-cover] propID="${propID}" not found in Airtable`);
	  return res.status(404).send("Prop not found in Airtable");
	}

	const propRecord = records[0];
	const f = propRecord.fields;
	const propShort = f.propShort || `Prop #${propID}`;

	// If already "generated", redirect
	if (f.propCoverStatus === "generated" && f.propCoverURL) {
	  console.log("[prop-cover] Already generated => redirecting =>", f.propCoverURL);
	  return res.redirect(f.propCoverURL);
	}

	// 2) Node Canvas => draw
	console.log("[prop-cover] Generating new PNG for propID =>", propID);
	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
	const ctx = canvas.getContext("2d");

	ctx.fillStyle = "#202020";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// Optional background image & grayscale
	const contentImage = f.contentImage || [];
	const contentImageUrl = contentImage[0]?.url;
	if (contentImageUrl) {
	  try {
		console.log("[prop-cover] Loading background =>", contentImageUrl);
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

		// grayscale
		const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const data = imageData.data;
		for (let i = 0; i < data.length; i += 4) {
		  const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
		  data[i] = gray;
		  data[i+1] = gray;
		  data[i+2] = gray;
		}
		ctx.putImageData(imageData, 0, 0);
	  } catch (bgErr) {
		console.warn("[prop-cover] Could not load background =>", bgErr);
	  }
	}

	// 50% black overlay
	ctx.fillStyle = "rgba(0,0,0,0.5)";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// Yellow text
	ctx.fillStyle = "#ffff00";
	ctx.textAlign = "left";
	ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
	wrapText(ctx, propShort, 100, 450, TEXT_MAX_WIDTH, LINE_HEIGHT);

	// PNG buffer
	const pngBuffer = canvas.toBuffer("image/png");
	console.log("[prop-cover] PNG buffer length =>", pngBuffer.length);

	// 3) Upload to Firebase Storage
	const fileName = `prop-${propID}.png`;
	const folder = "covers";
	const firebasePath = `${folder}/${fileName}`;

	console.log("[prop-cover] Uploading =>", firebasePath);
	const file = storageBucket.file(firebasePath);

	const writeStream = file.createWriteStream({
	  metadata: {
		contentType: "image/png",
	  },
	  resumable: false,
	});

	writeStream.end(pngBuffer);

	await new Promise((resolve, reject) => {
	  writeStream.on("finish", resolve);
	  writeStream.on("error", reject);
	});

	console.log("[prop-cover] Upload done => makePublic()");
	await file.makePublic();

	// Construct public link
	const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;
	console.log("[prop-cover] publicUrl =>", publicUrl);

	// 4) Update Airtable => propCoverURL, propCoverStatus
	await base("Props").update([
	  {
		id: propRecord.id,
		fields: {
		  propCoverURL: publicUrl,
		  propCoverStatus: "generated",
		},
	  },
	]);
	console.log("[prop-cover] Saved cover to Airtable =>", publicUrl);

	// 5) redirect
	return res.redirect(publicUrl);
  } catch (err) {
	console.error("[prop-cover] Error =>", err);
	return res.status(500).send("Error generating or uploading image");
  }
}

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
