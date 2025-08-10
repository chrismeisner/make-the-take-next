import { storageBucket } from "../../../lib/firebaseAdmin";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { filename, fileData } = req.body;
    if (!filename || !fileData) {
      return res.status(400).json({ success: false, error: "Missing filename or fileData" });
    }

    const buffer = Buffer.from(fileData, "base64");
    const folder = "contest-covers";
    const firebasePath = `${folder}/${filename}`;
    const file = storageBucket.file(firebasePath);

    await file.save(buffer, {
      metadata: { contentType: "image/png" },
      public: true,
      resumable: false,
    });

    const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;
    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    console.error("[api/admin/uploadContestCover] Error =>", error);
    return res.status(500).json({ success: false, error: "Upload failed" });
  }
}


