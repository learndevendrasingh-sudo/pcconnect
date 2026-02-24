'use client';

import { useState } from 'react';
import { X, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface AddAdminDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserRole: string;
}

export function AddAdminDialog({ isOpen, onClose, onSuccess, currentUserRole }: AddAdminDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'superadmin'>('admin');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`${role === 'superadmin' ? 'Super Admin' : 'Admin'} created successfully`);
        setUsername('');
        setPassword('');
        setRole('admin');
        onSuccess();
        onClose();
      } else {
        toast.error(data.error || 'Failed to create admin');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#112640] border border-[#1e3f68] rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-[#edf2fc] flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#5b87f7]" />
            Add New Admin
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-[#5e80a8] hover:text-[#edf2fc] hover:bg-[#1e3f68] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#5e80a8] mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="newadmin@example.com"
              autoFocus
              className="w-full px-4 py-2.5 bg-[#0c1a30] border border-[#1e3f68] rounded-lg text-[#edf2fc] placeholder-[#5e80a8]/50 focus:outline-none focus:border-[#3b6cf5] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#5e80a8] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Strong password"
              className="w-full px-4 py-2.5 bg-[#0c1a30] border border-[#1e3f68] rounded-lg text-[#edf2fc] placeholder-[#5e80a8]/50 focus:outline-none focus:border-[#3b6cf5] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#5e80a8] mb-1.5">Role</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  role === 'admin'
                    ? 'bg-[#2b5ddb]/15 border-[#2b5ddb] text-[#5b87f7]'
                    : 'bg-[#0c1a30] border-[#1e3f68] text-[#5e80a8] hover:border-[#2a5080]'
                }`}
              >
                Admin
              </button>
              {currentUserRole === 'superadmin' && (
                <button
                  type="button"
                  onClick={() => setRole('superadmin')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    role === 'superadmin'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                      : 'bg-[#0c1a30] border-[#1e3f68] text-[#5e80a8] hover:border-[#2a5080]'
                  }`}
                >
                  Super Admin
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#0c1a30] border border-[#1e3f68] hover:border-[#2a5080] text-[#5e80a8] font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="flex-1 py-2.5 bg-[#2b5ddb] hover:bg-[#3b6cf5] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
