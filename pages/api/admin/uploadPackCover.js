import { storageBucket } from "../../../lib/firebaseAdmin";
import crypto from "crypto";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb', // increase request size limit to 8mb
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { filename, fileData } = req.body;
    if (!fileData) {
      return res.status(400).json({ success: false, error: "Missing fileData" });
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(fileData, "base64");
    const folder = "pack-covers";

    // Derive a safe extension from the provided filename (fallback to .png)
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    const extRaw = typeof filename === "string" && filename.includes(".")
      ? "." + filename.split(".").pop().toLowerCase()
      : ".png";
    const ext = allowed.has(extRaw) ? extRaw : ".png";

    // Generate a random, URL-safe basename to avoid spaces/special chars
    const rand = crypto.randomBytes(8).toString("hex");
    const timestamp = Date.now();
    const safeBase = `pack_${timestamp}_${rand}`;
    const safeFileName = `${safeBase}${ext}`;
    const firebasePath = `${folder}/${safeFileName}`;
    const file = storageBucket.file(firebasePath);

    // Upload buffer to Firebase Storage
    const contentType = (
      ext === ".png" ? "image/png" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" :
      "application/octet-stream"
    );

    await file.save(buffer, {
      metadata: { contentType },
      public: true,
      resumable: false,
    });

    const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;
    return res.status(200).json({ success: true, url: publicUrl, filename: safeFileName });
  } catch (error) {
    console.error("[api/uploadPackCover] Error =>", error);
    return res.status(500).json({ success: false, error: "Upload failed" });
  }
} 