// pages/api/prop-cover/[propID].js
import { createCanvas, loadImage } from "canvas";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// Standard Open Graph dimensions
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;

// For text styling
const FONT_FAMILY = 'Helvetica';
const FONT_SIZE = 60; // px
const LINE_HEIGHT = 70; // px (slightly bigger than font size for spacing)
const TEXT_MAX_WIDTH = 1000; // We'll wrap text if it exceeds this width

export default async function handler(req, res) {
  try {
	const { propID } = req.query;
	if (!propID) {
	  return res.status(400).send("Missing propID");
	}

	// 1) Fetch the Prop data from Airtable
	const records = await base("Props")
	  .select({ filterByFormula: `{propID}="${propID}"`, maxRecords: 1 })
	  .firstPage();
	if (!records.length) {
	  return res.status(404).send("Prop not found");
	}

	const propRecord = records[0];
	const propTitle = propRecord.fields.propTitle || `Prop #${propID}`;
	const contentImage = propRecord.fields.contentImage;
	const contentImageUrl = contentImage?.[0]?.url;

	// 2) Create a canvas
	const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
	const ctx = canvas.getContext("2d");

	// Fill background in case the image fails or doesn't exist
	ctx.fillStyle = "#202020";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	// 3) Load the background image if available
	if (contentImageUrl) {
	  try {
		const bg = await loadImage(contentImageUrl);

		// We'll preserve aspect ratio by calculating a scale factor
		const ratio = Math.min(
		  CANVAS_WIDTH / bg.width,
		  CANVAS_HEIGHT / bg.height
		);
		const scaledWidth = bg.width * ratio;
		const scaledHeight = bg.height * ratio;

		// Center the image on the canvas
		const x = (CANVAS_WIDTH - scaledWidth) / 2;
		const y = (CANVAS_HEIGHT - scaledHeight) / 2;

		ctx.drawImage(bg, x, y, scaledWidth, scaledHeight);
	  } catch (err) {
		console.warn("[prop-cover] Could not load contentImageUrl:", err);
	  }
	}

	// 4) Draw the propTitle text with wrapping

	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "left"; // We'll start from left and wrap
	ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;

	// We'll place the text near bottom or center, or anywhere you like
	// For example: place near bottom with some margin
	const textX = 100; 
	const textY = 400; // start drawing lines at y=400
	wrapText(ctx, propTitle, textX, textY, TEXT_MAX_WIDTH, LINE_HEIGHT);

	// 5) Convert to PNG buffer
	const buffer = canvas.toBuffer("image/png");

	// 6) Send the image
	res.setHeader("Content-Type", "image/png");
	return res.send(buffer);
  } catch (err) {
	console.error("[prop-cover] Error =>", err);
	return res.status(500).send("Error generating image");
  }
}

/**
 * Helper: Wrap text onto multiple lines if it exceeds maxWidth.
 * 
 * - ctx: CanvasRenderingContext2D
 * - text: The string to wrap
 * - x, y: Starting position for the first line
 * - maxWidth: The wrap boundary
 * - lineHeight: Vertical distance between lines
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  // Split text into words
  const words = text.split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
	const testLine = line + words[n] + " ";
	const metrics = ctx.measureText(testLine);
	const testWidth = metrics.width;

	if (testWidth > maxWidth && n > 0) {
	  // Draw the current line if we exceed max width
	  ctx.fillText(line, x, y);
	  // Move down to next line
	  line = words[n] + " ";
	  y += lineHeight;
	} else {
	  line = testLine;
	}
  }
  // Draw the last line
  ctx.fillText(line, x, y);
}
