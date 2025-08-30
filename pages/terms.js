import Head from 'next/head';

export default function TermsPage() {
  return (
    <div className="bg-white text-gray-900 min-h-screen">
      <Head>
        <title>Terms of Use | Make the Take</title>
      </Head>
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">Terms of Use</h1>
        <p className="text-gray-700 mb-4">Last updated: {new Date().getFullYear()}</p>
        <p className="text-gray-800">
          This is placeholder content for the Terms of Use. It describes your agreement with Make the Take regarding use of the service. Replace with your legal text.
        </p>
        <h2 className="mt-6 text-xl font-semibold">Acceptable Use</h2>
        <p className="text-gray-800 mt-2">Placeholder description of rules for using the platform.</p>
        <h2 className="mt-6 text-xl font-semibold">Account & Eligibility</h2>
        <p className="text-gray-800 mt-2">Placeholder requirements for age, residency, and account responsibilities.</p>
        <h2 className="mt-6 text-xl font-semibold">Disclaimers & Liability</h2>
        <p className="text-gray-800 mt-2">Placeholder for warranty disclaimers and limitation of liability.</p>
        <h2 className="mt-6 text-xl font-semibold">Contact</h2>
        <p className="text-gray-800 mt-2">Contact us at support@makethetake.com.</p>
      </div>
    </div>
  );
}


