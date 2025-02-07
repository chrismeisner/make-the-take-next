// components/RelatedProp.js
import React, { useState, useEffect } from "react";

export default function RelatedProp({ currentSubjectID, currentPropID }) {
  const [relatedProp, setRelatedProp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
	if (!currentSubjectID) {
	  setError("No subject provided.");
	  setLoading(false);
	  return;
	}
	const url = `/api/related-prop?subjectID=${encodeURIComponent(currentSubjectID)}`;
	fetch(url)
	  .then((res) => res.json())
	  .then((data) => {
		if (data.success && data.prop && data.prop.propID !== currentPropID) {
		  setRelatedProp(data.prop);
		} else {
		  setError(data.error || "No related proposition found.");
		}
		setLoading(false);
	  })
	  .catch((err) => {
		console.error("[RelatedProp] Fetch error:", err);
		setError("Error fetching related proposition.");
		setLoading(false);
	  });
  }, [currentSubjectID, currentPropID]);

  if (loading) {
	return <div>Loading related proposition...</div>;
  }
  if (error) {
	return <div style={{ color: "red" }}>{error}</div>;
  }
  if (!relatedProp) {
	return null; // or "No related prop"
  }

  return (
	<div style={{ border: "1px solid #ccc", padding: "1rem", marginTop: "1rem" }}>
	  <h3>Related Proposition</h3>
	  <h4>{relatedProp.propTitle}</h4>
	  <p>{relatedProp.propSummary}</p>
	  {/* Possibly link to the prop page */}
	</div>
  );
}
