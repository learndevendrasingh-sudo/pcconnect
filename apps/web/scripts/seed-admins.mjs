import Redis from 'ioredis';
import bcrypt from 'bcryptjs';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

async function seed() {
  console.log('Seeding admin data...');

  // Super Admin
  const superAdminId = 'sa-001';
  const superAdminHash = await bcrypt.hash('SUPER@DE1231', 10);
  await redis.hmset(`admin:${superAdminId}`,
    'id', superAdminId,
    'username', 'superadmin@mydev.com',
    'passwordHash', superAdminHash,
    'role', 'superadmin',
    'createdAt', new Date().toISOString()
  );
  await redis.set('admin:username:superadmin@mydev.com', superAdminId);
  await redis.sadd('admins', superAdminId);
  console.log('  + superadmin@mydev.com (Super Admin)');

  // Admin
  const adminId = 'a-001';
  const adminHash = await bcrypt.hash('ADMIN@DE1231', 10);
  await redis.hmset(`admin:${adminId}`,
    'id', adminId,
    'username', 'admin@mydev.com',
    'passwordHash', adminHash,
    'role', 'admin',
    'createdAt', new Date().toISOString()
  );
  await redis.set('admin:username:admin@mydev.com', adminId);
  await redis.sadd('admins', adminId);
  console.log('  + admin@mydev.com (Admin)');

  // Site password
  await redis.set('site:password', 'DEV01-03-2026');
  console.log('  + Site password: DEV01-03-2026');

  console.log('Seed completed!');
  await redis.quit();
}

seed().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
