/**
 * Admin Provisioning Script
 * 
 * Usage:
 *   npx tsx scripts/provision-admin.ts <admin_email> [password] [full_name]
 * 
 * Example:
 *   npx tsx scripts/provision-admin.ts admin@hindustanhardware.com "SecurePass123!" "Admin Operator"
 * 
 * Requirements:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in environment (.env).
 *   - Never run or expose this from client apps.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

async function provisionAdmin() {
  const args = process.argv.slice(2);
  const email = args[0];
  const password = args[1] || 'TempAdmin@12345';
  const fullName = args[2] || 'Store Administrator';

  if (!email) {
    console.error('Error: Admin email is required.');
    console.error('Usage: npx tsx scripts/provision-admin.ts <email> [password] [fullName]');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in environment.');
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[Provisioning] Checking user existence for ${email}...`);

  // Check if user already exists
  const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to query users:', listError.message);
    process.exit(1);
  }

  const existingUser = usersData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  let userId: string;

  if (existingUser) {
    console.log(`[Provisioning] User ${email} already exists with ID: ${existingUser.id}`);
    userId = existingUser.id;
  } else {
    console.log(`[Provisioning] Creating new user for ${email}...`);
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !newUser.user) {
      console.error('Failed to create user:', createError?.message);
      process.exit(1);
    }

    userId = newUser.user.id;
    console.log(`[Provisioning] User created with ID: ${userId}`);
  }

  // Elevate or set role to 'admin' in profiles table
  console.log(`[Provisioning] Assigning 'admin' role in public.profiles...`);
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      id: userId,
      role: 'admin',
      full_name: fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    console.error('Failed to assign admin role in profiles table:', profileError.message);
    process.exit(1);
  }

  console.log(`[Provisioning] SUCCESS: User ${email} (ID: ${userId}) has been provisioned as an ADMIN.`);
}

provisionAdmin().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
