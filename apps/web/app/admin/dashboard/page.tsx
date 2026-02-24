'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, LogOut, Crown, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdminList } from '@/components/admin/admin-list';
import { AddAdminDialog } from '@/components/admin/add-admin-dialog';
import { SitePasswordSection } from '@/components/admin/site-password-section';

interface AdminUser {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

interface CurrentUser {
  id: string;
  username: string;
  role: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/admins');
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins);
      }
    } catch {
      toast.error('Failed to load admins');
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch('/api/admin/me');
        if (!meRes.ok) {
          router.push('/admin');
          return;
        }
        const meData = await meRes.json();
        setCurrentUser(meData);

        await fetchAdmins();
      } catch {
        router.push('/admin');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router, fetchAdmins]);

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin');
  }

  async function handleDelete(id: string, username: string) {
    if (!confirm(`Remove admin "${username}"? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/admin/admins/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (res.ok) {
        toast.success('Admin removed');
        fetchAdmins();
      } else {
        toast.error(data.error || 'Failed to remove admin');
      }
    } catch {
      toast.error('Something went wrong');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c1a30] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5b87f7] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c1a30]">
      {/* Header */}
      <header className="border-b border-[#1e3f68] bg-[#112640]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#2b5ddb]/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#5b87f7]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[#edf2fc]">Admin Dashboard</h1>
              <p className="text-xs text-[#5e80a8]">SecureDesk Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  currentUser.role === 'superadmin'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-[#2b5ddb]/10 text-[#5b87f7]'
                }`}>
                  {currentUser.role === 'superadmin' ? (
                    <Crown className="w-3.5 h-3.5" />
                  ) : (
                    <User className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-[#edf2fc]">{currentUser.username}</p>
                  <p className="text-xs text-[#5e80a8]">
                    {currentUser.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#5e80a8] hover:text-[#f87171] hover:bg-[#2a1520] border border-[#1e3f68] hover:border-[#5c2035] rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <AdminList
          admins={admins}
          currentUser={currentUser}
          onDelete={handleDelete}
          onAdd={() => setShowAddDialog(true)}
        />

        <SitePasswordSection />
      </main>

      {/* Add Admin Dialog */}
      <AddAdminDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={fetchAdmins}
        currentUserRole={currentUser?.role || 'admin'}
      />
    </div>
  );
}
