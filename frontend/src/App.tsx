import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';

type User = {
  id: string;
  displayName: string;
  email: string;
  photo?: string;
};

type EmailJob = {
  id: string;
  senderEmail: string;
  senderName?: string | null;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'SCHEDULED' | 'SENT' | 'FAILED';
  scheduledAt: string;
  sentAt?: string | null;
  minDelaySeconds: number;
  hourlyLimit: number;
};

type Attachment = {
  name: string;
  url: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

function formatDate(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleString();
}

function parseEmails(content: string) {
  const matches = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.toLowerCase())));
  return unique;
}

const toolbarButtons = [
  { label: 'B', cmd: 'bold' },
  { label: 'I', cmd: 'italic' },
  { label: 'U', cmd: 'underline' },
  { label: '•', cmd: 'insertUnorderedList' },
  { label: '1.', cmd: 'insertOrderedList' },
  { label: '"', cmd: 'formatBlock', value: 'blockquote' },
  { label: '↩', cmd: 'insertLineBreak' },
  { label: '🔗', cmd: 'createLink' },
  { label: '🖼', cmd: 'attachImage' },
  { label: '≡', cmd: 'justifyLeft' }
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [scheduled, setScheduled] = useState<EmailJob[]>([]);
  const [sent, setSent] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [showSendLater, setShowSendLater] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [failedOnly, setFailedOnly] = useState(false);
  const [csvEmails, setCsvEmails] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    senderEmail: '',
    senderName: '',
    subject: '',
    body: '',
    sendAt: '',
    minDelaySeconds: 2,
    hourlyLimit: 200
  });

  const recipients = useMemo(() => {
    const manual = parseEmails(toInput);
    return Array.from(new Set([...csvEmails, ...manual]));
  }, [csvEmails, toInput]);

  const emailCount = recipients.length;

  const canSubmit = useMemo(() => {
    return form.senderEmail && form.subject && form.body && form.sendAt && emailCount > 0;
  }, [form, emailCount]);

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    const path = activeTab === 'scheduled' ? '/api/emails/scheduled' : '/api/emails/sent';
    fetch(`${API_BASE}${path}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (activeTab === 'scheduled') {
          setScheduled(data.items ?? []);
        } else {
          setSent(data.items ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [activeTab, showCompose]);

  useEffect(() => {
    if (!showCompose) return;
    setTimeout(() => {
      editorRef.current?.focus();
    }, 50);
  }, [showCompose]);

  async function handleLogout() {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    setUser(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result ?? '');
      const emails = parseEmails(text);
      setCsvEmails(emails);
    };
    reader.readAsText(file);
  }

  function handleToolbarClick(cmd: string, value?: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (cmd === 'createLink') {
      const url = window.prompt('Enter URL');
      if (!url) return;
      document.execCommand('createLink', false, url);
      return;
    }
    if (cmd === 'attachImage') {
      imageInputRef.current?.click();
      return;
    }
    if (cmd === 'insertLineBreak') {
      document.execCommand('insertLineBreak');
      return;
    }
    if (cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, value ?? 'blockquote');
      return;
    }
    document.execCommand(cmd, false, value ?? undefined);
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      setAttachments((prev) => [...prev, { name: file.name, url: dataUrl }]);
    };
    reader.readAsDataURL(file);
  }

  async function handleSchedule(sendNow = false) {
    setLoading(true);
    try {
      const sendAt = sendNow ? new Date().toISOString() : new Date(form.sendAt).toISOString();
      const payload = {
        senderEmail: form.senderEmail,
        senderName: form.senderName || undefined,
        recipients,
        subject: form.subject,
        body: form.body,
        sendAt,
        minDelaySeconds: Number(form.minDelaySeconds),
        hourlyLimit: Number(form.hourlyLimit)
      };
      const res = await fetch(`${API_BASE}/api/emails/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to schedule');
      setShowCompose(false);
      setShowSendLater(false);
      setForm({
        senderEmail: '',
        senderName: '',
        subject: '',
        body: '',
        sendAt: '',
        minDelaySeconds: 2,
        hourlyLimit: 200
      });
      setCsvEmails([]);
      setToInput('');
      setAttachments([]);
      if (editorRef.current) editorRef.current.innerHTML = '';
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert('Failed to schedule. Check console.');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] text-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-center text-xl font-semibold">Login</h1>
          <div className="mt-5 grid gap-3">
            <a
              href={`${API_BASE}/auth/google`}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.3 0 6.2 1.1 8.5 3.2l6.4-6.4C34.8 2.5 29.7 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.4 5.8C12 12.4 17.6 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.7c-.3 2-1.6 5-4.6 7.1l7 5.4c4.2-3.8 6.4-9.4 6.4-16.2z"/>
                <path fill="#FBBC05" d="M10 28.9c-1-2-1.6-4.2-1.6-6.4 0-2.2.6-4.4 1.6-6.4l-7.4-5.8C.9 13.8 0 18 0 22.5 0 27 1 31.2 2.6 35.3l7.4-6.4z"/>
                <path fill="#34A853" d="M24 45c5.7 0 10.5-1.9 14-5.1l-7-5.4c-2 1.4-4.5 2.3-7 2.3-6.4 0-12-2.9-14.7-7.9l-7.4 6.4C6.5 42.6 14.6 48 24 48z"/>
              </svg>
              Login with Google
            </a>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or sign up through email
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <input
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              placeholder="Email ID"
              disabled
            />
            <input
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              placeholder="Password"
              disabled
              type="password"
            />
            <button className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white" disabled>
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const list = activeTab === 'scheduled' ? scheduled : sent;
  const filteredList = list
    .filter((job) => {
      if (failedOnly && job.status !== 'FAILED') return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        job.recipientEmail.toLowerCase().includes(q) ||
        job.subject.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const aTime =
        activeTab === 'sent'
          ? new Date(a.sentAt ?? a.scheduledAt).getTime()
          : new Date(a.scheduledAt).getTime();
      const bTime =
        activeTab === 'sent'
          ? new Date(b.sentAt ?? b.scheduledAt).getTime()
          : new Date(b.scheduledAt).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

  return (
    <div className="min-h-screen bg-[#f7f7f7] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-6">
          <div className="text-xl font-semibold tracking-tight">ReachInbox</div>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            {user.photo ? (
              <img
                className="h-10 w-10 rounded-full object-cover"
                src={user.photo}
                alt="avatar"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                }}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {user.displayName
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">{user.displayName}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            className="mt-4 w-full cursor-pointer rounded-full border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-600"
            onClick={() => setShowCompose(true)}
          >
            Compose
          </button>
          <div className="mt-6 text-xs uppercase text-slate-400">Core</div>
          <div className="mt-2 grid gap-1">
            <button
              className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${
                activeTab === 'scheduled'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600'
              }`}
              onClick={() => setActiveTab('scheduled')}
            >
              <span>Scheduled</span>
              <span className="text-xs text-slate-400">{scheduled.length}</span>
            </button>
            <button
              className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${
                activeTab === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'
              }`}
              onClick={() => setActiveTab('sent')}
            >
              <span>Sent</span>
              <span className="text-xs text-slate-400">{sent.length}</span>
            </button>
          </div>
        </aside>

        <div className="flex-1">
          <header className="relative flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex w-full max-w-xl items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-500">
              <input
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="ml-4 flex items-center gap-3">
              <button
                className="cursor-pointer text-sm text-slate-500"
                onClick={() => {
                  setShowFilter((v) => !v);
                  setShowSort(false);
                }}
              >
                Filters
              </button>
              <button
                className="cursor-pointer text-sm text-slate-500"
                onClick={() => {
                  setShowSort((v) => !v);
                  setShowFilter(false);
                }}
              >
                Sort
              </button>
              <button
                className="cursor-pointer rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>

            {showFilter && (
              <div className="absolute right-24 top-14 w-56 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
                <div className="text-xs font-semibold text-slate-500">Filters</div>
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={failedOnly}
                    onChange={(e) => setFailedOnly(e.target.checked)}
                  />
                  Failed only
                </label>
                <button
                  className="mt-3 cursor-pointer text-xs text-emerald-600"
                  onClick={() => setFailedOnly(false)}
                >
                  Clear filters
                </button>
              </div>
            )}

            {showSort && (
              <div className="absolute right-10 top-14 w-48 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
                <div className="text-xs font-semibold text-slate-500">Sort by</div>
                <button
                  className={`mt-2 w-full cursor-pointer rounded-lg px-2 py-1 text-left text-sm ${
                    sortOrder === 'newest' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'
                  }`}
                  onClick={() => setSortOrder('newest')}
                >
                  Newest first
                </button>
                <button
                  className={`mt-1 w-full cursor-pointer rounded-lg px-2 py-1 text-left text-sm ${
                    sortOrder === 'oldest' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'
                  }`}
                  onClick={() => setSortOrder('oldest')}
                >
                  Oldest first
                </button>
              </div>
            )}
          </header>

          <main className="px-8 py-6">
            <div className="space-y-1">
              {loading ? (
                <div className="text-sm text-slate-500">Loading...</div>
              ) : filteredList.length === 0 ? (
                <div className="text-sm text-slate-500">No emails found.</div>
              ) : (
                filteredList.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between border-b border-slate-200 py-3 text-sm"
                  >
                    <div className="text-slate-600">To: {job.recipientEmail}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          activeTab === 'sent'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-orange-100 text-orange-600'
                        }`}
                      >
                        {activeTab === 'sent' ? 'Sent' : 'Scheduled'}
                      </span>
                      <span className="text-slate-500">
                        {activeTab === 'sent' ? formatDate(job.sentAt) : formatDate(job.scheduledAt)}
                      </span>
                      <span className="text-slate-700">{job.subject}</span>
                    </div>
                    <div className="text-slate-400">☆</div>
                  </div>
                ))
              )}
            </div>
          </main>
        </div>
      </div>

      {showCompose && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <button className="cursor-pointer text-lg" onClick={() => setShowCompose(false)}>
                ←
              </button>
              <h2 className="text-lg font-semibold">Compose New Email</h2>
            </div>
            <div className="flex items-center gap-3">
              <button className="cursor-pointer text-sm text-slate-500">📎</button>
              <button
                className="cursor-pointer text-sm text-slate-500"
                onClick={() => setShowSendLater((v) => !v)}
              >
                ⏱
              </button>
              <button
                className="cursor-pointer rounded-full border border-emerald-500 px-4 py-1.5 text-sm text-emerald-600"
                onClick={() => handleSchedule(true)}
              >
                Send
              </button>
              <button
                className="cursor-pointer rounded-full border border-emerald-500 px-4 py-1.5 text-sm text-emerald-600"
                onClick={() => setShowSendLater(true)}
              >
                Send Later
              </button>
            </div>
          </div>
          <div className="mx-auto max-w-4xl px-6 py-6">
            <div className="grid gap-5">
              <div className="grid grid-cols-[80px_1fr] items-center gap-4">
                <div className="text-sm text-slate-500">From</div>
                <input
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm"
                  placeholder="you@domain.com"
                  value={form.senderEmail}
                  onChange={(e) => setForm({ ...form, senderEmail: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-4">
                <div className="text-sm text-slate-500">To</div>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 border-b border-slate-200 px-2 py-1 text-sm outline-none"
                    placeholder="recipient@example.com"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                  />
                  <label className="cursor-pointer text-sm text-emerald-600">
                    Upload List
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-4">
                <div className="text-sm text-slate-500">Subject</div>
                <input
                  className="border-b border-slate-200 px-2 py-1 text-sm outline-none"
                  placeholder="Subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-[200px_1fr_1fr] items-center gap-4">
                <div className="text-sm text-slate-500">Delay between 2 emails</div>
                <input
                  className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  value={form.minDelaySeconds}
                  onChange={(e) => setForm({ ...form, minDelaySeconds: Number(e.target.value) })}
                />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">Hourly Limit</span>
                  <input
                    className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    min={1}
                    value={form.hourlyLimit}
                    onChange={(e) => setForm({ ...form, hourlyLimit: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
                  {toolbarButtons.map((btn) => (
                    <button
                      key={btn.label}
                      className="cursor-pointer rounded-md border border-transparent px-2 py-1 hover:border-slate-200"
                      onClick={() => handleToolbarClick(btn.cmd, btn.value)}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                <div
                  ref={editorRef}
                  className="min-h-[320px] w-full bg-transparent p-4 text-sm outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    const text = (e.target as HTMLDivElement).innerText;
                    setForm((prev) => ({ ...prev, body: text }));
                  }}
                />
              </div>

              {attachments.length > 0 && (
                <div className="grid gap-3">
                  <div className="text-xs text-slate-500">Attachments</div>
                  <div className="flex flex-wrap gap-3">
                    {attachments.map((att, idx) => (
                      <div
                        key={`${att.name}-${idx}`}
                        className="w-40 overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        <img src={att.url} alt={att.name} className="h-24 w-full object-cover" />
                        <div className="px-2 py-1 text-[11px] text-slate-500">{att.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-slate-500">{emailCount} emails loaded</div>
            </div>
          </div>

          {showSendLater && (
            <div className="absolute right-8 top-20 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              <div className="text-sm font-semibold">Send Later</div>
              <input
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="datetime-local"
                value={form.sendAt}
                onChange={(e) => setForm({ ...form, sendAt: e.target.value })}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  className="cursor-pointer rounded-full border border-slate-200 px-3 py-1.5 text-xs"
                  onClick={() => setShowSendLater(false)}
                >
                  Cancel
                </button>
                <button
                  className="cursor-pointer rounded-full border border-emerald-500 px-3 py-1.5 text-xs text-emerald-600"
                  onClick={() => handleSchedule(false)}
                  disabled={!canSubmit}
                >
                  Schedule
                </button>
              </div>
            </div>
          )}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagePick}
          />
        </div>
      )}
    </div>
  );
}

export default App;
