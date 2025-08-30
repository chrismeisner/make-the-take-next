import Head from 'next/head';
import Link from 'next/link';

export default function HowToPlayPage() {
  return (
    <div className="bg-white text-gray-900 min-h-screen">
      <Head>
        <title>How to Play | Make the Take</title>
      </Head>
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">How to Play</h1>
        <ol className="list-decimal pl-5 space-y-2 text-gray-800">
          <li>Pick a pack from the homepage.</li>
          <li>Make your takes quickly for each prop in the pack.</li>
          <li>Score points for correct takes and climb the leaderboard.</li>
          <li>First place wins the pack prize when the pack is graded.</li>
        </ol>
        <p className="mt-4 text-gray-600 text-sm">Takes lock when the game starts. Your latest take counts.</p>

        <h2 className="mt-8 text-xl md:text-2xl font-semibold">How our platform works</h2>
        <p className="mt-2 text-gray-700">
          This is a quick overview. We’ll expand this section with examples, screenshots, and tips.
        </p>
        <ul className="mt-3 list-disc pl-5 space-y-1 text-gray-800">
          <li><span className="font-medium">Packs</span> bundle multiple props around games or events.</li>
          <li><span className="font-medium">Props</span> are statements you can take a side on.</li>
          <li><span className="font-medium">Takes</span> are your picks. You can update them until lock.</li>
          <li><span className="font-medium">Locking</span> happens at event start; no more changes after lock.</li>
          <li><span className="font-medium">Grading</span> resolves props and awards points.</li>
          <li><span className="font-medium">Leaderboard</span> ranks takers by points to determine winners.</li>
        </ul>

        <h2 className="mt-8 text-xl md:text-2xl font-semibold">FAQ</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="font-medium">When do takes lock?</p>
            <p className="text-gray-700">At event start time. You can edit takes freely before then.</p>
          </div>
          <div>
            <p className="font-medium">How are points calculated?</p>
            <p className="text-gray-700">Correct takes earn points. We’ll publish exact scoring and examples here soon.</p>
          </div>
          <div>
            <p className="font-medium">What happens if a prop pushes?</p>
            <p className="text-gray-700">Pushes don’t impact win percentage and typically award zero points.</p>
          </div>
          <div>
            <p className="font-medium">Can I change my take after submitting?</p>
            <p className="text-gray-700">Yes. Only your latest take before lock counts.</p>
          </div>
          <div>
            <p className="font-medium">How do I win a prize?</p>
            <p className="text-gray-700">Finish at the top of the pack leaderboard when grading completes.</p>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Link href="/">
            <span className="inline-flex items-center px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">See Available Packs</span>
          </Link>
        </div>

        <h2 className="mt-10 text-xl md:text-2xl font-semibold">Contact us</h2>
        <p className="mt-2 text-gray-700">
          Have questions or feedback? Email us at <a href="mailto:support@makethetake.com" className="text-blue-600 underline">support@makethetake.com</a>.
          We typically respond within 1–2 business days.
        </p>

        <h2 className="mt-10 text-xl md:text-2xl font-semibold">Terms & policies</h2>
        <p className="mt-2 text-gray-700">
          The content on this page is for informational purposes only and may be
          updated. By using Make the Take, you agree to our terms of use and
          acknowledge our privacy practices.
        </p>
        <ul className="mt-3 list-disc pl-5 space-y-1 text-gray-800">
          <li>
            <a href="/terms" className="text-blue-600 underline font-medium">Terms of Use</a>
            <span className="text-gray-700"> — Placeholder text for user obligations and acceptable use.</span>
          </li>
          <li>
            <a href="/privacy" className="text-blue-600 underline font-medium">Privacy Policy</a>
            <span className="text-gray-700"> — Placeholder text for data collection and retention.</span>
          </li>
          <li><span className="font-medium">Eligibility</span>: Placeholder text for age and jurisdiction requirements.</li>
          <li><span className="font-medium">Disclaimers</span>: Placeholder text for no warranties and limitation of liability.</li>
        </ul>
      </div>
    </div>
  );
}


