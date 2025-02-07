// pages/api/prop-cover/[propID].js
import { createCanvas, loadImage } from "canvas";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;

const FONT_FAMILY = "Helvetica";
const FONT_SIZE = 60;
const LINE_HEIGHT = 70;
const TEXT_MAX_WIDTH = 1000;

export default async function handler(req, res) {
  try {
	const { propID } = req.query;
	if (!propID) {
	  return res.status(400).send("Missing propID");
	}

	// 1) Fetch the prop from Airtable
	const records = await base("Props")
	  .select({ filterByFormula: `{propID}="${propID}"`, maxRecords: 1 })
	  .firstPage();
	if (!records.length) return res.status(404).send("Prop not found");

	const propRecord = records[0];
	// We'll overlay the propShort text
	const propShort = propRecord.fields.propShort || `Prop #${propID}`;
	const contentImage = propRecord.fields.contentImage;
	const contentImageUrl = contentImage?.[0]?.url;

	// 2) Create the canvas
	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
	const ctx = canvas.getContext("2d");

	// Fill a fallback background if no image
	ctx.fillStyle = "#202020";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// 3) Draw the background image with "cover" scaling, then convert to grayscale
	if (contentImageUrl) {
	  try {
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

		// Convert the entire canvas to grayscale
		const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
		const data = imageData.data;

		for (let i = 0; i < data.length; i += 4) {
		  const r = data[i];
		  const g = data[i + 1];
		  const b = data[i + 2];
		  // Luminance
		  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
		  data[i] = gray;
		  data[i + 1] = gray;
		  data[i + 2] = gray;
		  // Alpha (data[i+3]) remains unchanged
		}
		ctx.putImageData(imageData, 0, 0);
	  } catch (err) {
		console.warn("[prop-cover] Could not load background image:", err);
	  }
	}

	// 4) Add a 50% black overlay
	ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// 5) Draw your text on top, now in yellow color.
	ctx.fillStyle = "#ffff00"; // Updated to yellow
	ctx.textAlign = "left";
	ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
	wrapText(ctx, propShort, 100, 450, TEXT_MAX_WIDTH, LINE_HEIGHT);

	// 6) Output as PNG
	const buffer = canvas.toBuffer("image/png");
	res.setHeader("Content-Type", "image/png");
	return res.send(buffer);
  } catch (err) {
	console.error("[prop-cover] Error =>", err);
	return res.status(500).send("Error generating image");
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
