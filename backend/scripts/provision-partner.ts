/**
 * Delivery Partner Provisioning Script
 * 
 * Usage:
 *   npm run provision:partner <email> [password] [fullName] [phone]
 * 
 * Example:
 *   npx tsx scripts/provision-partner.ts driver@hindustanhardware.com "PartnerPass123!" "Ramesh Driver" "+919876543210"
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

async function provisionPartner() {
  const args = process.argv.slice(2);
  const email = args[0] || 'driver@hindustanhardware.com';
  const password = args[1] || 'PartnerPass123!';
  const fullName = args[2] || 'Ramesh Kumar (Delivery Partner)';
  const phone = args[3] || '+919876543210';

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
    // Update password to ensure it matches
    await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  } else {
    console.log(`[Provisioning] Creating new delivery partner user for ${email}...`);
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    if (createError || !newUser.user) {
      console.error('Failed to create user:', createError?.message);
      process.exit(1);
    }

    userId = newUser.user.id;
    console.log(`[Provisioning] User created with ID: ${userId}`);
  }

  // Set role to 'delivery_partner' in public.profiles
  console.log(`[Provisioning] Assigning 'delivery_partner' role in public.profiles...`);
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      id: userId,
      role: 'delivery_partner',
      full_name: fullName,
      phone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    console.error('Failed to assign delivery_partner role in profiles table:', profileError.message);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`✅ SUCCESS: Delivery Partner account ready!`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Name:     ${fullName}`);
  console.log(`   Phone:    ${phone}`);
  console.log(`   Role:     delivery_partner`);
  console.log(`======================================================\n`);
}

provisionPartner().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
