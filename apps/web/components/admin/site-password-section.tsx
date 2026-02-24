'use client';

import { useState, useEffect } from 'react';
import { Key, Copy, Check, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export function SitePasswordSection() {
  const [sitePassword, setSitePassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchPassword();
  }, []);

  async function fetchPassword() {
    try {
      const res = await fetch('/api/admin/site-password');
      if (res.ok) {
        const data = await res.json();
        setSitePassword(data.sitePassword);
      }
    } catch {
      toast.error('Failed to load site password');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword.trim() || newPassword.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/admin/site-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitePassword: newPassword }),
      });

      if (res.ok) {
        const data = await res.json();
        setSitePassword(data.sitePassword);
        setNewPassword('');
        toast.success('Site password updated');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(sitePassword);
    setCopied(true);
    toast.success('Password copied');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-[#112640] border border-[#1e3f68] rounded-xl p-6">
      <h2 className="text-lg font-semibold text-[#edf2fc] flex items-center gap-2 mb-5">
        <Key className="w-5 h-5 text-[#5b87f7]" />
        Site Access Password
      </h2>

      <p className="text-sm text-[#5e80a8] mb-4">
        Visitors must enter this password to access the main site.
      </p>

      {/* Current password display */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex-1 px-4 py-2.5 bg-[#0c1a30] border border-[#1e3f68] rounded-lg text-[#edf2fc] font-mono text-sm">
          {loading ? '...' : sitePassword || 'Not set'}
        </div>
        <button
          onClick={handleCopy}
          disabled={loading || !sitePassword}
          className="px-3 py-2.5 bg-[#0c1a30] border border-[#1e3f68] hover:border-[#2a5080] rounded-lg text-[#5e80a8] hover:text-[#edf2fc] transition-colors disabled:opacity-50"
          title="Copy password"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Update form */}
      <form onSubmit={handleUpdate} className="flex gap-2">
        <input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new site password"
          className="flex-1 px-4 py-2.5 bg-[#0c1a30] border border-[#1e3f68] rounded-lg text-[#edf2fc] placeholder-[#5e80a8]/50 focus:outline-none focus:border-[#3b6cf5] transition-colors"
        />
        <button
          type="submit"
          disabled={saving || !newPassword.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#2b5ddb] hover:bg-[#3b6cf5] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Update
        </button>
      </form>
    </div>
  );
}
