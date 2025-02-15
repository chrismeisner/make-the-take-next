import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  const { packURL } = req.query;
  console.log("[API /packs/[packURL]] handler => packURL:", packURL);

  if (!packURL) {
	console.log("[API /packs/[packURL]] => missing packURL param => 400");
	return res.status(400).json({
	  success: false,
	  error: "Missing packURL parameter",
	});
  }

  try {
	// 1) Log environment variables (for debugging)
	console.log(
	  "AIRTABLE_API_KEY starts with:",
	  process.env.AIRTABLE_API_KEY?.slice?.(0, 4)
	);
	console.log("AIRTABLE_BASE_ID:", process.env.AIRTABLE_BASE_ID);

	// 2) Find the pack record matching the given packURL
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packURL} = "${packURL}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	console.log(
	  "[API /packs/[packURL]] => packRecords length:",
	  packRecords?.length
	);

	if (!packRecords || packRecords.length === 0) {
	  console.log("[API /packs/[packURL]] => No matching pack => 404");
	  return res.status(404).json({
		success: false,
		error: "Pack not found",
	  });
	}

	const packRecord = packRecords[0];
	const packFields = packRecord.fields;

	// 3) Build the Props data by retrieving linked record IDs from the "Props" field
	const linkedPropIDs = packFields.Props || [];
	console.log("[API /packs/[packURL]] => linkedPropIDs:", linkedPropIDs);

	let propsData = [];

	if (linkedPropIDs.length > 0) {
	  // Build a formula like: OR(RECORD_ID()='rec123', RECORD_ID()='rec456', ...)
	  const formula = `OR(${linkedPropIDs
		.map((id) => `RECORD_ID()='${id}'`)
		.join(",")})`;

	  const propsRecords = await base("Props")
		.select({
		  filterByFormula: formula,
		  maxRecords: 100,
		})
		.all();

	  console.log(
		"[API /packs/[packURL]] => propsRecords length:",
		propsRecords?.length
	  );

	  propsData = propsRecords.map((record) => {
		const f = record.fields;

		// Parse the contentImage attachments into an array of URLs and filenames
		let contentImageUrls = [];
		if (Array.isArray(f.contentImage)) {
		  contentImageUrls = f.contentImage.map((img) => ({
			url: img.url,
			filename: img.filename,
		  }));
		}

		// Parse contentTitles & contentURLs to build an array of { title, url } pairs
		const contentTitles = Array.isArray(f.contentTitles)
		  ? f.contentTitles
		  : [];
		const contentURLs = Array.isArray(f.contentURLs)
		  ? f.contentURLs
		  : [];
		const contentLinks = contentTitles.map((title, i) => {
		  const url = contentURLs[i] || "#";
		  return { title, url };
		});

		return {
		  airtableId: record.id,
		  propID: f.propID || null,
		  propTitle: f.propTitle || "Untitled",
		  propSummary: f.propSummary || "",
		  propStatus: f.propStatus || "open",
		  contentImageUrls,
		  contentLinks,
		  propOrder: f.propOrder || 0, // include the numeric ordering field
		};
	  });
	}

	// 4) Parse the "packPrizeImage" attachment field
	let packPrizeImage = [];
	if (Array.isArray(packFields.packPrizeImage)) {
	  packPrizeImage = packFields.packPrizeImage.map((img) => ({
		url: img.url,
		filename: img.filename,
	  }));
	}

	// 5) Parse the "packCover" attachment field (NEW)
	let packCover = [];
	if (Array.isArray(packFields.packCover)) {
	  packCover = packFields.packCover.map((img) => ({
		url: img.url,
		filename: img.filename,
	  }));
	}

	// 6) Return the pack data along with its props and other fields
	console.log(
	  "[API /packs/[packURL]] => returning success, propsData length:",
	  propsData.length
	);

	return res.status(200).json({
	  success: true,
	  pack: {
		packID: packFields.packID,
		packTitle: packFields.packTitle || "Untitled Pack",
		packURL: packFields.packURL,
		props: propsData,
		packPrize: packFields.packPrize || "",
		packPrizeImage,
		prizeSummary: packFields.prizeSummary || "",
		packPrizeURL: packFields.packPrizeURL || "",
		packCover, // NEW field for the cover image
	  },
	});
  } catch (error) {
	console.error("[API /packs/[packURL]] => Error:", error);
	return res.status(500).json({
	  success: false,
	  error: "Internal server error",
	});
  }
}
