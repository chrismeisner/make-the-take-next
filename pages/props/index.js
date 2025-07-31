import React from "react";
import Link from "next/link";

export default function PropsListPage({ propsList }) {
  return (
    <div style={{ padding: "1rem", maxWidth: "1024px", margin: "0 auto" }}>
      <h1 className="text-3xl font-bold mb-4">All Propositions</h1>
      <ul className="list-disc pl-5">
        {propsList.map((prop) => (
          <li key={prop.propID}>
            <Link href={`/props/${prop.propID}`} className="text-blue-600 underline">
              {prop.propTitle}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function getServerSideProps() {
  const Airtable = require("airtable");
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  const records = await base("Props").select({ view: "Grid view" }).all();

  const propsList = records.map((rec) => {
    const f = rec.fields;
    return {
      propID: f.propID,
      propTitle: f.propTitle || f.propShort || f.propID,
    };
  });

  return {
    props: { propsList },
  };
} 