// js/auth.js — Supabase v2 auth (UMD) with clean success redirects
(() => {
  'use strict';

  // Fetch keys securely from Vercel API route
  async function getSupabaseKeys() {
    console.log('[Auth] Fetching keys from /api/keys...');
    const resp = await fetch('/api/keys');
    if (!resp.ok) {
      console.error('[Auth] Failed to fetch keys:', resp.status, resp.statusText);
      throw new Error('Failed to fetch Supabase keys');
    }
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await resp.json();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('[Auth] Keys missing in response:', { SUPABASE_URL, SUPABASE_ANON_KEY });
      throw new Error('Supabase keys missing from API response');
    }
    console.log('[Auth] Keys fetched successfully');
    return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  }

  // Initialize Supabase client
  (async () => {
    try {
      const { url, key } = await getSupabaseKeys();

      const client = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          storage: window.localStorage,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        }
      });

      window.supabaseClient = client;
      console.log('[Auth] Supabase initialized successfully');

      setupAuth(client);
    } catch (err) {
      console.error('[Auth] Failed to initialize:', err);
    }
  })();

  function setupAuth(client) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    function showMessage(text, isError = false) {
      const errorMsg = document.getElementById('error-message');
      const successMsg = document.getElementById('success-message');

      if (isError && errorMsg) {
        errorMsg.textContent = text;
        errorMsg.style.display = 'block';
        errorMsg.style.color = '#dc2626';
        if (successMsg) successMsg.style.display = 'none';
      } else if (!isError && successMsg) {
        successMsg.textContent = text;
        successMsg.style.display = 'block';
        successMsg.style.color = '#16a34a';
        if (errorMsg) errorMsg.style.display = 'none';
      }
    }

    function setFormDisabled(form, disabled) {
      if (!form) return;
      const inputs = form.querySelectorAll('input, button');
      inputs.forEach(input => input.disabled = disabled);
    }

    // LOGIN handler
    async function handleLogin(e) {
      e.preventDefault();
      const form = e.target;

      const email = form.querySelector('#email')?.value?.trim();
      const password = form.querySelector('#password')?.value;

      if (!email || !password) {
        showMessage('Email and password are required', true);
        return;
      }

      setFormDisabled(form, true);
      showMessage('Signing in...');

      try {
        console.log('[Auth] Attempting login for:', email);
        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
          console.error('[Auth] Login error:', error);
          showMessage(error.message, true);
          setFormDisabled(form, false);
          return;
        }

        console.log('[Auth] Login response:', data);

        if (!data.session) {
          showMessage('Authentication failed', true);
          setFormDisabled(form, false);
          return;
        }

        // SUCCESS - redirect cleanly
        showMessage('✅ Signed in successfully! Redirecting...');
        setTimeout(() => {
          window.location.replace('/OllyStream.html');
        }, 800);

      } catch (err) {
        console.error('[Auth] Login failed:', err);
        showMessage('Login failed: ' + err.message, true);
        setFormDisabled(form, false);
      }
    }

    // REGISTER handler
    async function handleRegister(e) {
      e.preventDefault();
      const form = e.target;

      const email = form.querySelector('#email')?.value?.trim();
      const password = form.querySelector('#password')?.value;
      const confirmPassword = form.querySelector('#confirmPassword')?.value;
      const fullName = form.querySelector('#full_name, #fullname')?.value?.trim() || '';
      const org = form.querySelector('#org')?.value?.trim() || '';

      if (!email || !password) {
        showMessage('Email and password are required', true);
        return;
      }
      if (password !== confirmPassword) {
        showMessage('Passwords do not match', true);
        return;
      }

      setFormDisabled(form, true);
      showMessage('Creating account...');

      try {
        console.log('[Auth] Attempting registration for:', email, 'with meta:', { fullName, org });
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, org } }
        });

        console.log('[Auth] Registration response:', data, error);

        if (error) {
          console.error('[Auth] Registration error:', error);
          showMessage(error.message, true);
          setFormDisabled(form, false);
          return;
        }

        if (!data.session) {
          showMessage('✅ Check your email to confirm your account.', false);
          setFormDisabled(form, false);
          return;
        }

        // SUCCESS - redirect cleanly
        showMessage('✅ Account created successfully! Redirecting...');
        setTimeout(() => {
          window.location.replace('/OllyStream.html');
        }, 800);

      } catch (err) {
        console.error('[Auth] Registration failed:', err);
        showMessage('Registration failed: ' + err.message, true);
        setFormDisabled(form, false);
      }
    }

    // Attach form handlers
    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
      registerForm.addEventListener('submit', handleRegister);
    }
  }
})();
