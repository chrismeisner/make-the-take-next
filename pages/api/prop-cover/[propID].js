// pages/api/prop-cover/[propID].js
import { createCanvas, loadImage } from "canvas";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// The standard Open Graph size: 1200 x 630
const WIDTH = 1200;
const HEIGHT = 630;

export default async function handler(req, res) {
  try {
	const { propID } = req.query;
	if (!propID) {
	  return res.status(400).send("Missing propID");
	}

	// 1) Fetch the prop data from Airtable
	const records = await base("Props")
	  .select({ filterByFormula: `{propID}="${propID}"`, maxRecords: 1 })
	  .firstPage();

	if (!records.length) {
	  return res.status(404).send("Prop not found");
	}

	const propRecord = records[0];
	const propTitle = propRecord.fields.propTitle || `Prop #${propID}`;
	const contentImage = propRecord.fields.contentImage;
	// contentImage is typically an array of file objects in Airtable
	// We'll just take the first if it exists
	const contentImageUrl = contentImage?.[0]?.url;

	// 2) Create a canvas
	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d");

	// 3) If we have a contentImageUrl, load it as background
	//    Otherwise, fill a solid background (or load some default)
	if (contentImageUrl) {
	  try {
		const bgImage = await loadImage(contentImageUrl);
		ctx.drawImage(bgImage, 0, 0, WIDTH, HEIGHT);
	  } catch (err) {
		console.warn(
		  "[prop-cover] Could not load contentImageUrl, using fallback bg:",
		  err
		);
		// fallback background
		ctx.fillStyle = "#202020";
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
	  }
	} else {
	  // fallback if no contentImageUrl
	  ctx.fillStyle = "#202020";
	  ctx.fillRect(0, 0, WIDTH, HEIGHT);
	}

	// 4) Now overlay text on top. For example, center it horizontally
	ctx.font = 'bold 60px "Helvetica"';
	ctx.fillStyle = "#ffffff";
	ctx.textAlign = "center";

	// We'll do a simple measure to place the text near the middle
	// The text will appear around y=HEIGHT/2, or a bit lower for aesthetics
	const x = WIDTH / 2;
	const y = HEIGHT / 2;
	// Optionally wrap text if it's too long. We'll keep it simple here:
	ctx.fillText(propTitle, x, y);

	// 5) Convert to PNG buffer
	const buffer = canvas.toBuffer("image/png");

	// 6) Send the image
	res.setHeader("Content-Type", "image/png");
	// Possibly set caching headers if you want
	return res.send(buffer);
  } catch (err) {
	console.error("[prop-cover] Error =>", err);
	return res.status(500).send("Error generating image");
  }
}
