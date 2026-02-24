import { redis } from './redis';

export interface Admin {
  id: string;
  username: string;
  passwordHash: string;
  role: 'superadmin' | 'admin';
  createdAt: string;
}

// --- Admin CRUD ---

export async function getAllAdmins(): Promise<Admin[]> {
  const ids = await redis.smembers('admins');
  if (ids.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.hgetall(`admin:${id}`);
  }
  const results = await pipeline.exec();
  if (!results) return [];

  return results
    .map(([err, data]) => {
      if (err || !data || typeof data !== 'object') return null;
      const d = data as Record<string, string>;
      if (!d.id) return null;
      return {
        id: d.id,
        username: d.username,
        passwordHash: d.passwordHash,
        role: d.role as 'superadmin' | 'admin',
        createdAt: d.createdAt,
      };
    })
    .filter((a): a is Admin => a !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getAdminByUsername(username: string): Promise<Admin | null> {
  const id = await redis.get(`admin:username:${username}`);
  if (!id) return null;
  return getAdminById(id);
}

export async function getAdminById(id: string): Promise<Admin | null> {
  const data = await redis.hgetall(`admin:${id}`);
  if (!data || !data.id) return null;
  return {
    id: data.id,
    username: data.username,
    passwordHash: data.passwordHash,
    role: data.role as 'superadmin' | 'admin',
    createdAt: data.createdAt,
  };
}

export async function addAdmin(admin: Admin): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.hmset(`admin:${admin.id}`,
    'id', admin.id,
    'username', admin.username,
    'passwordHash', admin.passwordHash,
    'role', admin.role,
    'createdAt', admin.createdAt
  );
  pipeline.set(`admin:username:${admin.username}`, admin.id);
  pipeline.sadd('admins', admin.id);
  await pipeline.exec();
}

export async function removeAdmin(id: string): Promise<boolean> {
  const admin = await getAdminById(id);
  if (!admin) return false;

  const pipeline = redis.pipeline();
  pipeline.del(`admin:${id}`);
  pipeline.del(`admin:username:${admin.username}`);
  pipeline.srem('admins', id);
  await pipeline.exec();
  return true;
}

// --- Site Password ---

export async function getSitePassword(): Promise<string> {
  return (await redis.get('site:password')) || '';
}

export async function setSitePassword(password: string): Promise<void> {
  await redis.set('site:password', password);
}
