// File: /pages/admin/recount.js

import { useState } from "react";
import { useSession } from "next-auth/react";

export default function AdminRecountPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState("");

  if (!session?.user) {
	return <div>Not logged in.</div>;
  }

  // If you store admin check in session.user.role === 'admin', do that here
  // if (session.user.role !== 'admin') {
  //   return <div>Unauthorized</div>;
  // }

  async function handleRecountClick() {
	setStatus("Recounting...");
	try {
	  const res = await fetch("/api/admin/recount", {
		method: "POST",
	  });
	  const data = await res.json();
	  if (!res.ok || !data.success) {
		throw new Error(data.error || "Recount failed");
	  }
	  setStatus(`Success! Updated ${data.updatedCount} Props.`);
	} catch (err) {
	  console.error(err);
	  setStatus(`Error: ${err.message}`);
	}
  }

  return (
	<div style={{ padding: "1rem" }}>
	  <h1>Admin Recount Tool</h1>
	  <p>Click the button below to recount Side A/B for all Props.</p>
	  <button onClick={handleRecountClick} style={{ padding: "0.5rem 1rem", marginTop: "1rem" }}>
		Run Recount
	  </button>
	  {status && (
		<div style={{ marginTop: "1rem", color: status.startsWith("Error") ? "red" : "green" }}>
		  {status}
		</div>
	  )}
	</div>
  );
}
