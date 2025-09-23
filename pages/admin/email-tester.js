import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function AdminEmailTesterPage({ emailFrom, resendConfigured }) {
  const { data: session } = useSession();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Test Email');
  const [body, setBody] = useState('This is a test email from Admin Email Tester.');
  const [html, setHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  if (!session?.user) {
    return <div className="p-4">Please log in.</div>;
  }

  async function sendTest(e) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const payload = { to, subject, text: body };
      if (html && html.trim()) payload.html = html;
      const res = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Admin Email Tester</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">Back to Admin</Link>
      </div>

      <div className="mb-4 p-3 border rounded bg-gray-50 text-sm">
        <div><span className="text-gray-700">From:</span> <span className="font-mono">{emailFrom || 'onboarding@resend.dev'}</span></div>
        <div className="text-gray-600 mt-1">Status: {resendConfigured ? (<span className="text-green-700">Resend configured</span>) : (<span className="text-yellow-700">Simulated send (RESEND_API_KEY not set)</span>)}</div>
      </div>

      <form onSubmit={sendTest} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To *</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded"
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Text Body *</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">HTML Body (optional)</label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border rounded"
            placeholder="<strong>Hello</strong> world"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={sending}
            className={`px-4 py-2 rounded text-white ${sending ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {sending ? 'Sending…' : 'Send Test Email'}
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            onClick={() => { setTo(''); setSubject('Test Email'); setBody('This is a test email from Admin Email Tester.'); setHtml(''); setResult(null); }}
          >
            Reset
          </button>
        </div>
      </form>

      {result && (
        <div className="mt-4 text-sm">
          {result.success ? (
            <p className="text-green-700">Sent {result.simulated ? '(simulated)' : ''} {result.id ? `(id: ${result.id})` : ''}</p>
          ) : (
            <p className="text-red-700">Error: {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps() {
  const from = (process.env.EMAIL_FROM || 'onboarding@resend.dev').trim();
  const configured = Boolean((process.env.RESEND_API_KEY || '').trim());
  return { props: { emailFrom: from, resendConfigured: configured } };
}


