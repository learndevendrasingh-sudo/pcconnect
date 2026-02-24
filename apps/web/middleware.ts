import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'securedesk-admin-jwt-fallback-dev'
);

const ADMIN_COOKIE = 'admin-session';
const SITE_COOKIE = 'site-access';

async function isValidAdmin(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Admin dashboard protection ---
  if (pathname.startsWith('/admin/dashboard')) {
    if (await isValidAdmin(request)) {
      return NextResponse.next();
    }
    const response = NextResponse.redirect(new URL('/admin', request.url));
    response.cookies.delete(ADMIN_COOKIE);
    return response;
  }

  // --- Admin API protection (except login) ---
  if (pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/admin/login')) {
    if (await isValidAdmin(request)) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Site password gate for / and /session/* ---
  if (pathname === '/' || pathname.startsWith('/session/')) {
    if (await isValidAdmin(request)) {
      return NextResponse.next();
    }
    const siteAccess = request.cookies.get(SITE_COOKIE)?.value;
    if (siteAccess === 'granted') {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/gate', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/session/:path*',
    '/admin/dashboard/:path*',
    '/api/admin/:path*',
  ],
};
