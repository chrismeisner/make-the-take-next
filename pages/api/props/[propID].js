// File: pages/api/props/[propID].js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { propID } = req.query;
  if (!propID) {
    return res.status(400).json({ success: false, error: "Missing propID parameter" });
  }

  try {
    const records = await base("Props")
      .select({
        filterByFormula: `{propID} = "${propID}"`,
        maxRecords: 1,
      })
      .firstPage();

    if (!records || records.length === 0) {
      return res.status(404).json({ success: false, error: `Prop not found for propID="${propID}"` });
    }

    const record = records[0];
    const data = record.fields;
    // Remove static side count fields; compute dynamic counts instead
    delete data.propSideACount;
    delete data.propSideBCount;
    const createdAt = record._rawJson.createdTime;

    // Compute dynamic side counts for this prop
    const takesRecords = await base("Takes")
      .select({
        filterByFormula: `AND({propID}="${propID}", {takeStatus}!="overwritten")`,
        maxRecords: 10000,
      })
      .all();

    let sideACount = 0;
    let sideBCount = 0;
    takesRecords.forEach((take) => {
      const side = take.fields.propSide;
      if (side === "A") sideACount++;
      if (side === "B") sideBCount++;
    });

    let subjectLogoUrls = [];
    if (Array.isArray(data.subjectLogo)) {
      subjectLogoUrls = data.subjectLogo.map((logo) => logo.url || "");
    }

    let contentImageUrl = "";
    if (Array.isArray(data.contentImage) && data.contentImage.length > 0) {
      contentImageUrl = data.contentImage[0].url || "";
    }

    // Build content list if present
    const contentTitles = data.contentTitles || [];
    const contentURLs = data.contentURLs || [];
    const contentList = contentTitles.map((title, i) => ({ contentTitle: title, contentURL: contentURLs[i] || "" }));

    res.status(200).json({
      success: true,
      propID,
      createdAt,
      // include all other prop fields except static counts
      ...data,
      subjectLogoUrls,
      contentImageUrl,
      content: contentList,
      sideACount,
      sideBCount,
    });
  } catch (err) {
    console.error("[API /props/[propID]] Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
} 