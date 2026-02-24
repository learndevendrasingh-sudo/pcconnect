'use client';

import { Trash2, UserPlus, Crown, User } from 'lucide-react';

interface AdminUser {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

interface AdminListProps {
  admins: AdminUser[];
  currentUser: { id: string; role: string } | null;
  onDelete: (id: string, username: string) => void;
  onAdd: () => void;
}

export function AdminList({ admins, currentUser, onDelete, onAdd }: AdminListProps) {
  return (
    <div className="bg-[#112640] border border-[#1e3f68] rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-[#edf2fc] flex items-center gap-2">
          <User className="w-5 h-5 text-[#5b87f7]" />
          Admin Accounts
        </h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-[#2b5ddb] hover:bg-[#3b6cf5] text-white text-sm font-medium rounded-lg transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Admin
        </button>
      </div>

      <div className="space-y-2">
        {admins.map((admin) => (
          <div
            key={admin.id}
            className="flex items-center justify-between px-4 py-3 bg-[#0c1a30] border border-[#1e3f68] rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                admin.role === 'superadmin'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-[#2b5ddb]/10 text-[#5b87f7]'
              }`}>
                {admin.role === 'superadmin' ? (
                  <Crown className="w-4 h-4" />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-[#edf2fc]">{admin.username}</p>
                <p className="text-xs text-[#5e80a8]">
                  Added {new Date(admin.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                admin.role === 'superadmin'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-[#2b5ddb]/10 text-[#5b87f7] border border-[#2b5ddb]/20'
              }`}>
                {admin.role === 'superadmin' ? 'Super Admin' : 'Admin'}
              </span>

              {currentUser?.role === 'superadmin' &&
               admin.role !== 'superadmin' &&
               admin.id !== currentUser.id && (
                <button
                  onClick={() => onDelete(admin.id, admin.username)}
                  className="p-1.5 text-[#5e80a8] hover:text-[#f87171] hover:bg-[#2a1520] rounded-lg transition-colors"
                  title="Remove admin"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        {admins.length === 0 && (
          <div className="text-center py-8 text-[#5e80a8] text-sm">
            No admins found
          </div>
        )}
      </div>
    </div>
  );
}
