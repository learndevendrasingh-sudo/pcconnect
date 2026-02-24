'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Loader2 } from 'lucide-react';

export default function GatePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/site/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json();
        setError(data.error || 'Incorrect password');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0c1a30] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#2b5ddb]/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#5b87f7]" />
          </div>
          <span className="text-xl font-bold text-[#edf2fc]">SecureDesk</span>
        </div>

        {/* Gate Card */}
        <div className="bg-[#112640] border border-[#1e3f68] rounded-xl p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-full bg-[#1e3f68]/50 flex items-center justify-center mb-4">
              <Lock className="w-7 h-7 text-[#5b87f7]" />
            </div>
            <h1 className="text-xl font-semibold text-[#edf2fc]">Site Access Required</h1>
            <p className="text-sm text-[#5e80a8] mt-1">Enter the access password to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Access password"
                autoFocus
                className="w-full px-4 py-3 bg-[#0c1a30] border border-[#1e3f68] rounded-lg text-[#edf2fc] placeholder-[#5e80a8] focus:outline-none focus:border-[#3b6cf5] transition-colors"
              />
            </div>

            {error && (
              <div className="px-3 py-2 bg-[#2a1520] border border-[#5c2035] rounded-lg text-sm text-[#f87171]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full py-3 bg-[#2b5ddb] hover:bg-[#3b6cf5] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Enter'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
