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
    const createdAt = record._rawJson.createdTime;

    // Map relevant fields for front-end
    const sideACount = data.propSideACount || 0;
    const sideBCount = data.propSideBCount || 0;

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