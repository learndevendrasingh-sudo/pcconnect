'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, LogIn, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Logged in successfully');
        router.push('/admin/dashboard');
      } else {
        toast.error(data.error || 'Login failed');
        setLoading(false);
      }
    } catch {
      toast.error('Something went wrong');
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

        {/* Login Card */}
        <div className="bg-[#112640] border border-[#1e3f68] rounded-xl p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-full bg-[#1e3f68]/50 flex items-center justify-center mb-4">
              <LogIn className="w-7 h-7 text-[#5b87f7]" />
            </div>
            <h1 className="text-xl font-semibold text-[#edf2fc]">Admin Login</h1>
            <p className="text-sm text-[#5e80a8] mt-1">Sign in to manage SecureDesk</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#5e80a8] mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin@example.com"
                autoFocus
                className="w-full px-4 py-3 bg-[#0c1a30] border border-[#1e3f68] rounded-lg text-[#edf2fc] placeholder-[#5e80a8]/50 focus:outline-none focus:border-[#3b6cf5] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#5e80a8] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-[#0c1a30] border border-[#1e3f68] rounded-lg text-[#edf2fc] placeholder-[#5e80a8]/50 focus:outline-none focus:border-[#3b6cf5] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full py-3 bg-[#2b5ddb] hover:bg-[#3b6cf5] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
