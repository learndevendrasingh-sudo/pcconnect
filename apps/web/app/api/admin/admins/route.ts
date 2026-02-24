import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAllAdmins, getAdminByUsername, addAdmin } from '@/lib/admin/db';
import { getSessionFromCookies } from '@/lib/admin/auth';

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admins = await getAllAdmins();
    const sanitized = admins.map(({ passwordHash, ...rest }) => rest);

    return NextResponse.json({ admins: sanitized });
  } catch (e) {
    console.error('List admins error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username, password, role } = await request.json();

    if (!username || !password || !role) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (role === 'superadmin' && session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only Super Admin can create Super Admins' }, { status: 403 });
    }

    const existing = await getAdminByUsername(username);
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();

    await addAdmin({
      id,
      username,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(
      { admin: { id, username, role, createdAt: new Date().toISOString() } },
      { status: 201 }
    );
  } catch (e) {
    console.error('Create admin error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
