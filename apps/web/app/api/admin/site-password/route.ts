import { NextResponse } from 'next/server';
import { getSitePassword, setSitePassword } from '@/lib/admin/db';
import { getSessionFromCookies } from '@/lib/admin/auth';

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sitePassword = await getSitePassword();
    return NextResponse.json({ sitePassword });
  } catch (e) {
    console.error('Get site password error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sitePassword } = await request.json();
    if (!sitePassword || sitePassword.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
    }

    await setSitePassword(sitePassword);
    return NextResponse.json({ success: true, sitePassword });
  } catch (e) {
    console.error('Update site password error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
