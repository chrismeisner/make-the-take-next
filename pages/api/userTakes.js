import { getSession } from "next-auth/react";
import { createRepositories } from "../../lib/dal/factory";

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }
  
  // Support fetching by propID if provided; otherwise, return all takes for the user.
  const { propID } = req.query;
  const session = await getSession({ req });
  if (!session?.user?.phone) {
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { takes } = createRepositories();
    if (propID) {
      const latest = await takes.getLatestForUser({ propID, phone: session.user.phone });
      if (!latest) {
        return res.status(200).json({ success: true });
      }
      const side = latest.propSide || latest.prop_side || null;
      const takeID = latest.TakeID || latest.id;
      return res.status(200).json({ success: true, side, takeID });
    }
    const list = await takes.listLatestForPhone(session.user.phone);
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(200).json({ success: true, takes: [] });
    }
    const simplified = list.map((t) => ({
      takeID: t.takeID || t.id,
      propID: t.propID || null,
      takeMobile: t.takeMobile || null,
      takeStatus: t.takeStatus || null,
      takeResult: t.takeResult || null,
      packs: t.packs || [],
    }));
    return res.status(200).json({ success: true, takes: simplified });
  } catch (error) {
	console.error("[userTakes] Error fetching user takes:", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Error fetching user takes" });
  }
}
