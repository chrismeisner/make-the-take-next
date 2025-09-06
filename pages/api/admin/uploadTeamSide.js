import { getToken } from "next-auth/jwt";
import { storageBucket } from "../../../lib/firebaseAdmin";

export const config = {
  api: { bodyParser: { sizeLimit: "8mb" } },
};

function inferContentType(filename = "") {
  const lower = String(filename).toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { filename, fileData, teamRef, side } = req.body || {};
    if (!filename || !fileData) {
      return res.status(400).json({ success: false, error: "Missing filename or fileData" });
    }
    const safeTeam = (teamRef || "generic").replace(/[^a-z0-9_-]/gi, "-");
    const safeSide = (side === "away" ? "away" : "home");

    // Generate a unique, cache-busting filename while preserving extension
    const lower = String(filename).toLowerCase();
    let ext = 'png';
    if (lower.endsWith('.webp')) ext = 'webp';
    else if (lower.endsWith('.png')) ext = 'png';
    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) ext = 'jpg';
    else if (lower.endsWith('.gif')) ext = 'gif';
    const uniqueName = `${Date.now()}-${safeTeam}-${safeSide}.${ext}`;

    const buffer = Buffer.from(fileData, "base64");
    const folder = `team-sides/${safeTeam}/${safeSide}`;
    const firebasePath = `${folder}/${uniqueName}`;
    const file = storageBucket.file(firebasePath);

    const contentType = inferContentType(uniqueName);
    await file.save(buffer, {
      metadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      public: true,
      resumable: false,
    });

    const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;
    return res.status(200).json({ success: true, url: publicUrl, filename: uniqueName });
  } catch (error) {
    console.error("[api/admin/uploadTeamSide] Error =>", error);
    return res.status(500).json({ success: false, error: "Upload failed" });
  }
}


