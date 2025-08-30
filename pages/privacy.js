import Head from 'next/head';

export default function PrivacyPage() {
  return (
    <div className="bg-white text-gray-900 min-h-screen">
      <Head>
        <title>Privacy Policy | Make the Take</title>
      </Head>
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-gray-700 mb-4">Last updated: {new Date().getFullYear()}</p>
        <p className="text-gray-800">
          This is placeholder content for the Privacy Policy. It explains what data we collect, how we use it, and your rights. Replace with your legal text.
        </p>
        <h2 className="mt-6 text-xl font-semibold">Information We Collect</h2>
        <p className="text-gray-800 mt-2">Placeholder for account info, usage data, and cookies.</p>
        <h2 className="mt-6 text-xl font-semibold">How We Use Information</h2>
        <p className="text-gray-800 mt-2">Placeholder for service delivery, security, and analytics.</p>
        <h2 className="mt-6 text-xl font-semibold">Your Rights</h2>
        <p className="text-gray-800 mt-2">Placeholder for access, deletion, and data portability rights.</p>
        <h2 className="mt-6 text-xl font-semibold">Contact</h2>
        <p className="text-gray-800 mt-2">Contact us at privacy@makethetake.com.</p>
      </div>
    </div>
  );
}


