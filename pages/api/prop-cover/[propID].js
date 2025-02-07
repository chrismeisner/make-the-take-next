// pages/api/prop-cover/[propID].js
import { createCanvas, loadImage } from "canvas";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  try {
	const { propID } = req.query;
	if (!propID) {
	  return res.status(400).send("Missing propID");
	}

	// 1) Fetch the prop title (or any relevant data) from Airtable if needed
	const records = await base("Props")
	  .select({ filterByFormula: `{propID}="${propID}"`, maxRecords: 1 })
	  .firstPage();
	const propRecord = records[0];
	const propTitle = propRecord?.fields?.propTitle || `Prop #${propID}`;

	// 2) Create a canvas (1200x630 is a standard “Open Graph” dimension)
	const width = 1200;
	const height = 630;
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");

	// 3) Draw background
	context.fillStyle = "#202020";
	context.fillRect(0, 0, width, height);

	// 4) Optionally load a background image
	// const bgImage = await loadImage("https://placehold.co/1200x630");
	// context.drawImage(bgImage, 0, 0, width, height);

	// 5) Draw title text
	context.font = 'bold 60px "Helvetica"';
	context.fillStyle = "#ffffff";
	context.textAlign = "center";
	context.fillText(propTitle, width / 2, height / 2);

	// 6) Convert canvas to a PNG Buffer
	const buffer = canvas.toBuffer("image/png");

	// 7) Send the image
	res.setHeader("Content-Type", "image/png");
	res.setHeader("Cache-Control", "public, max-age=0, must-revalidate"); 
	// Optional caching headers
	return res.send(buffer);
  } catch (err) {
	console.error("[prop-cover] Error =>", err);
	return res.status(500).send("Error generating image");
  }
}
