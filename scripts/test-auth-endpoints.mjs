const BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

function log(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`Status: ${result.status}`);
  console.log(JSON.stringify(result.data, null, 2));
}

async function main() {
  console.log(`Testing auth endpoints at ${BASE}`);

  const shortcodeDiscover = await request('POST', '/institutions/discover', {
    query: 'KMTC-NRB',
    mode: 'shortcode',
  });
  log('Discover (shortcode)', shortcodeDiscover);

  const emailDiscover = await request('POST', '/institutions/discover', {
    query: 'meshackkimaiyo5@gmail.com',
    mode: 'email',
  });
  log('Discover (email)', emailDiscover);

  const institutionId = emailDiscover.data?.id ?? shortcodeDiscover.data?.id;
  if (!institutionId) {
    throw new Error('Discovery failed — run pnpm db:seed-auth first');
  }

  const registryLogin = await request('POST', '/auth/login/registry', {
    institutionId,
    admissionNumber: 'NTI/2023/1234',
    password: 'NTI/2023/1234',
  });
  log('Registry login (shortcode flow)', registryLogin);

  const registryToken = registryLogin.data?.accessToken;
  if (registryToken) {
    const me = await request('GET', '/auth/me', null, registryToken);
    log('GET /auth/me (registry session)', me);

    const changePassword = await request(
      'POST',
      '/auth/change-password',
      {
        currentPassword: 'NTI/2023/1234',
        newPassword: 'NewPass123!',
      },
      registryToken,
    );
    log('Change password', changePassword);
  }

  const initiateOtp = await request('POST', '/auth/login/email/initiate', {
    institutionId,
    email: 'meshackkimaiyo5@gmail.com',
  });
  log('Email OTP initiate', initiateOtp);

  console.log('\nCheck server logs for OTP code, then run:');
  console.log(
    `API_BASE=${BASE} OTP=xxxxxx node scripts/test-auth-email-verify.mjs ${institutionId}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
