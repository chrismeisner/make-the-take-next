// File: pages/admin/outbox.js
import { useState, useEffect } from "react";
import Link from "next/link";

export default function OutboxAdminPage() {
  const [outboxRecords, setOutboxRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchOutboxRecords() {
	try {
	  const res = await fetch("/api/outbox");
	  const data = await res.json();
	  if (data.success) {
		setOutboxRecords(data.outbox);
	  } else {
		setError(data.error || "Error fetching records");
	  }
	} catch (err) {
	  console.error(err);
	  setError("Error fetching records");
	} finally {
	  setLoading(false);
	}
  }

  useEffect(() => {
	fetchOutboxRecords();
  }, []);

  async function handleSend(recordId) {
	try {
	  const res = await fetch("/api/outbox/sendOne", {
		method: "POST",
		headers: {
		  "Content-Type": "application/json",
		},
		body: JSON.stringify({ recordId }),
	  });
	  const data = await res.json();
	  if (data.success) {
		// Refresh the records to update the status
		fetchOutboxRecords();
	  } else {
		alert("Error sending message: " + data.error);
	  }
	} catch (e) {
	  alert("Error sending message");
	}
  }

  if (loading) return <div>Loading Outbox Records...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;

  return (
	<div style={{ padding: "1rem" }}>
	  <h1>Outbox Admin</h1>
	  <p>
		<Link href="/">Back to Home</Link>
	  </p>
	  <table border="1" cellPadding="8" cellSpacing="0">
		<thead>
		  <tr>
			<th>Record ID</th>
			<th>Message</th>
			<th>Recipients</th>
			<th>Status</th>
			<th>Actions</th>
		  </tr>
		</thead>
		<tbody>
		  {outboxRecords.map((record) => (
			<tr key={record.id}>
			  <td>{record.id}</td>
			  <td>{record.outboxMessage}</td>
			  <td>
				{Array.isArray(record.outboxRecipients)
				  ? record.outboxRecipients.join(", ")
				  : record.outboxRecipients}
			  </td>
			  <td>{record.outboxStatus}</td>
			  <td>
				{record.outboxStatus === "ready" && (
				  <button onClick={() => handleSend(record.id)}>Send</button>
				)}
			  </td>
			</tr>
		  ))}
		</tbody>
	  </table>
	</div>
  );
}
