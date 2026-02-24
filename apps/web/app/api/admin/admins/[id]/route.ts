import { NextResponse } from 'next/server';
import { getAdminById, removeAdmin } from '@/lib/admin/db';
import { getSessionFromCookies } from '@/lib/admin/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only Super Admin can remove admins' }, { status: 403 });
    }

    const target = await getAdminById(id);
    if (!target) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    if (target.role === 'superadmin') {
      return NextResponse.json({ error: 'Cannot remove a Super Admin' }, { status: 403 });
    }

    if (target.id === session.sub) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 403 });
    }

    await removeAdmin(id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Delete admin error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
