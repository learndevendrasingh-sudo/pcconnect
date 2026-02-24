import { NextResponse } from 'next/server';
import { getSitePassword } from '@/lib/admin/db';
import { SITE_PASSWORD_COOKIE } from '@/lib/admin/auth';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const sitePassword = await getSitePassword();

    if (!sitePassword || password !== sitePassword) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(SITE_PASSWORD_COOKIE, 'granted', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return response;
  } catch (e) {
    console.error('Verify password error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
