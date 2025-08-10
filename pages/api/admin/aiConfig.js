import { getToken } from "next-auth/jwt";

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const defaultModel = process.env.OPENAI_DEFAULT_MODEL || "gpt-5-mini";
  return res.status(200).json({ success: true, defaultModel });
}


