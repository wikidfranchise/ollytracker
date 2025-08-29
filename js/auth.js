(() => {
  'use strict';

  // Fetch keys securely from Vercel API route
  async function getSupabaseKeys() {
    const resp = await fetch('/api/keys');
    if (!resp.ok) throw new Error('Failed to fetch Supabase keys');
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await resp.json();
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase keys missing from API response');
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

      setupAuth(client);
    } catch (err) {
      console.error('[Auth] Failed to initialize:', err);
      const errorMsg = document.getElementById('error-message');
      if (errorMsg) {
        errorMsg.textContent = 'Connection error. Please try again.';
        errorMsg.style.display = 'block';
      }
    }
  })();

  function setupAuth(client) {
    const registerForm = document.getElementById('register-form');

    function showMessage(text, isError = false) {
      const errorMsg = document.getElementById('error-message');
      const successMsg = document.getElementById('success-message');

      if (isError && errorMsg) {
        errorMsg.textContent = text;
        errorMsg.style.display = 'block';
        if (successMsg) successMsg.style.display = 'none';
      } else if (!isError && successMsg) {
        successMsg.textContent = text;
        successMsg.style.display = 'block';
        if (errorMsg) errorMsg.style.display = 'none';
      }
    }

    function setFormDisabled(form, disabled) {
      if (!form) return;
      const inputs = form.querySelectorAll('input, button');
      inputs.forEach(input => input.disabled = disabled);
    }

    // REGISTER handler
    async function handleRegister(e) {
      e.preventDefault();
      const form = e.target;

      const email = form.querySelector('#email')?.value?.trim();
      const password = form.querySelector('#password')?.value;
      const confirmPassword = form.querySelector('#confirmPassword')?.value;
      const fullName = form.querySelector('#full_name')?.value?.trim() || '';
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
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, org } }
        });

        if (error) {
          showMessage(error.message, true);
          setFormDisabled(form, false);
          return;
        }

        if (!data.session) {
          showMessage('Check your email to confirm your account.', false);
          setFormDisabled(form, false);
          return;
        }

        // SUCCESS - redirect
        showMessage('Account created! Redirecting...');
        setTimeout(() => {
          window.location.replace('/index.html');
        }, 1000);

      } catch (err) {
        showMessage('Registration failed: ' + err.message, true);
        setFormDisabled(form, false);
      }
    }

    if (registerForm) {
      registerForm.addEventListener('submit', handleRegister);
    }
  }
})();

