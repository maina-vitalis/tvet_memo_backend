const BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1';
const institutionId = process.argv[2];
const otp = process.env.OTP;

if (!institutionId || !otp) {
  console.error('Usage: OTP=123456 node scripts/test-auth-email-verify.mjs <institutionId>');
  process.exit(1);
}

const response = await fetch(`${BASE}/auth/login/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    institutionId,
    email: 'student@institution.ac.ke',
    otp,
  }),
});

const data = await response.json();
console.log('Status:', response.status);
console.log(JSON.stringify(data, null, 2));
