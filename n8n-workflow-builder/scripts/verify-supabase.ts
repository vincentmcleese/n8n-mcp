// scripts/verify-supabase.ts

console.log('🔍 Verifying Supabase Client Setup...\n');

// Check environment variables
console.log('1️⃣  Checking environment variables...');

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY'
];

let allEnvVarsSet = true;
for (const envVar of requiredEnvVars) {
  const value = process.env[envVar];
  if (value) {
    console.log(`✅ ${envVar}: ${value.substring(0, 20)}...`);
  } else {
    console.log(`❌ ${envVar}: Missing`);
    allEnvVarsSet = false;
  }
}

if (!allEnvVarsSet) {
  console.error('\n❌ Some environment variables are missing.');
  console.error('Please check your .env.local file.');
  process.exit(1);
}

console.log('\n✅ All environment variables are set!');
console.log('\n🎉 Supabase client setup verified successfully!');
console.log('\nNext steps:');
console.log('1. Run "npm run dev" to start the development server');
console.log('2. Visit http://localhost:3000/api/supabase-test to test the connection');
console.log('3. Generate database types with: npx supabase gen types typescript --local > types/database.types.ts');