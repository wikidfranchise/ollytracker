// js/auth.js — PRODUCTION-READY Supabase Auth with Bulletproof Redirects
(() => {
  'use strict';

  // Global state management
  window.authState = {
    initialized: false,
    client: null,
    session: null,
    redirecting: false
  };

  // Secure key fetching with retry logic
  async function getSupabaseKeys(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch('/api/keys', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          cache: 'no-cache'
        });
        
        if (!resp.ok) {
          throw new Error(`API keys fetch failed: ${resp.status} ${resp.statusText}`);
        }
        
        const data = await resp.json();
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = data;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
          throw new Error('Missing Supabase credentials in API response');
        }

        return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
      } catch (err) {
        console.warn(`[Auth] Key fetch attempt ${i + 1} failed:`, err.message);
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  // Safe redirect function with loop prevention
  function safeRedirect(url, reason = '') {
    if (window.authState.redirecting) {
      console.warn('[Auth] Redirect already in progress, ignoring:', url);
      return;
    }

    window.authState.redirecting = true;
    console.log(`[Auth] Redirecting to ${url}${reason ? ` (${reason})` : ''}`);
    
    // Clear any existing timers
    if (window.authRedirectTimer) {
      clearTimeout(window.authRedirectTimer);
    }

    // Use replace to prevent back button issues
    setTimeout(() => {
      window.location.replace(url);
    }, 100);
  }

  // Initialize Supabase with comprehensive error handling
  async function initializeSupabase() {
    try {
      console.log('[Auth] Initializing Supabase client...');
      const { url, key } = await getSupabaseKeys();

      const client = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          storage: window.localStorage,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        },
        global: {
          headers: {
            'X-Client-Info': 'ollytracker-web'
          }
        }
      });

      // Validate client creation
      if (!client || !client.auth) {
        throw new Error('Failed to create Supabase client');
      }

      window.supabaseClient = client;
      window.authState.client = client;
      window.authState.initialized = true;

      console.log('[Auth] ✅ Supabase client initialized successfully');
      return client;

    } catch (err) {
      console.error('[Auth] ❌ Supabase initialization failed:', err);
      window.authState.initialized = false;
      throw err;
    }
  }

  // Enhanced session validation
  async function validateSession(client) {
    try {
      const { data: { session }, error } = await client.auth.getSession();
      
      if (error) {
        console.error('[Auth] Session validation error:', error);
        return null;
      }

      if (session) {
        // Additional session health checks
        const now = Date.now() / 1000;
        const expiresAt = session.expires_at;
        
        if (expiresAt && expiresAt < now) {
          console.warn('[Auth] Session expired, attempting refresh...');
          const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
          
          if (refreshError || !refreshData.session) {
            console.warn('[Auth] Session refresh failed:', refreshError);
            return null;
          }
          
          return refreshData.session;
        }

        console.log('[Auth] ✅ Valid session found for:', session.user?.email);
        window.authState.session = session;
        return session;
      }

      return null;
    } catch (err) {
      console.error('[Auth] Session validation failed:', err);
      return null;
    }
  }

  // Message display with auto-clear
  function showMessage(text, isError = false, duration = 5000) {
    const errorMsg = document.getElementById('error-message');
    const successMsg = document.getElementById('success-message');

    // Clear existing messages
    if (errorMsg) {
      errorMsg.style.display = 'none';
      errorMsg.textContent = '';
    }
    if (successMsg) {
      successMsg.style.display = 'none';
      successMsg.textContent = '';
    }

    const targetMsg = isError ? errorMsg : successMsg;
    if (targetMsg) {
      targetMsg.textContent = text;
      targetMsg.style.display = 'block';
      targetMsg.style.color = isError ? '#dc2626' : '#16a34a';

      // Auto-clear after duration
      if (duration > 0) {
        setTimeout(() => {
          targetMsg.style.display = 'none';
        }, duration);
      }
    }
  }

  // Form state management
  function setFormDisabled(form, disabled) {
    if (!form) return;
    const inputs = form.querySelectorAll('input, button');
    inputs.forEach(input => {
      input.disabled = disabled;
      if (disabled) {
        input.style.opacity = '0.6';
        input.style.cursor = 'not-allowed';
      } else {
        input.style.opacity = '1';
        input.style.cursor = '';
      }
    });
  }

  // Enhanced login handler
  async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;

    const email = form.querySelector('#email')?.value?.trim();
    const password = form.querySelector('#password')?.value;

    if (!email || !password) {
      showMessage('Email and password are required', true);
      return;
    }

    if (!window.authState.client) {
      showMessage('Authentication system not ready. Please refresh and try again.', true);
      return;
    }

    setFormDisabled(form, true);
    showMessage('Signing in...', false, 0);

    try {
      const { data, error } = await window.authState.client.auth.signInWithPassword({ 
        email, 
        password 
      });

      if (error) {
        console.error('[Auth] Login error:', error);
        showMessage(error.message || 'Login failed', true);
        setFormDisabled(form, false);
        return;
      }

      if (!data.session) {
        showMessage('Authentication failed - no session created', true);
        setFormDisabled(form, false);
        return;
      }

      // Success - store session and redirect
      window.authState.session = data.session;
      showMessage('✅ Login successful! Redirecting...', false, 0);
      
      // Delay redirect to ensure session is fully established
      setTimeout(() => {
        safeRedirect('/index.html', 'successful login');
      }, 1200);

    } catch (err) {
      console.error('[Auth] Login exception:', err);
      showMessage(`Login failed: ${err.message}`, true);
      setFormDisabled(form, false);
    }
  }

  // Enhanced registration handler
  async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;

    const email = form.querySelector('#email')?.value?.trim();
    const password = form.querySelector('#password')?.value;
    const confirmPassword = form.querySelector('#confirmPassword')?.value;
    const fullName = form.querySelector('#full_name, #fullname')?.value?.trim() || '';
    const org = form.querySelector('#org')?.value?.trim() || '';

    // Validation
    if (!email || !password) {
      showMessage('Email and password are required', true);
      return;
    }
    if (password !== confirmPassword) {
      showMessage('Passwords do not match', true);
      return;
    }
    if (password.length < 6) {
      showMessage('Password must be at least 6 characters', true);
      return;
    }

    if (!window.authState.client) {
      showMessage('Authentication system not ready. Please refresh and try again.', true);
      return;
    }

    setFormDisabled(form, true);
    showMessage('Creating account...', false, 0);

    try {
      const { data, error } = await window.authState.client.auth.signUp({
        email,
        password,
        options: { 
          data: { 
            full_name: fullName, 
            org: org,
            created_at: new Date().toISOString()
          }
        }
      });

      if (error) {
        console.error('[Auth] Registration error:', error);
        showMessage(error.message || 'Registration failed', true);
        setFormDisabled(form, false);
        return;
      }

      // Handle email confirmation flow
      if (!data.session) {
        showMessage('✅ Registration successful! Please check your email to confirm your account.', false, 0);
        setFormDisabled(form, false);
        return;
      }

      // Immediate session available (auto-confirm enabled)
      window.authState.session = data.session;
      showMessage('✅ Account created successfully! Redirecting...', false, 0);
      
      setTimeout(() => {
        safeRedirect('/index.html', 'successful registration');
      }, 1200);

    } catch (err) {
      console.error('[Auth] Registration exception:', err);
      showMessage(`Registration failed: ${err.message}`, true);
      setFormDisabled(form, false);
    }
  }

  // Setup authentication handlers
  function setupAuth(client) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // Attach form handlers
    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);
      console.log('[Auth] Login form handler attached');
    }

    if (registerForm) {
      registerForm.addEventListener('submit', handleRegister);
      console.log('[Auth] Register form handler attached');
    }

    // Setup auth state change listener
    const { data: authListener } = client.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change:', event, session?.user?.email || 'no session');
      
      window.authState.session = session;

      switch (event) {
        case 'SIGNED_IN':
          if (session && !window.authState.redirecting) {
            // Only redirect if we're on auth pages
            const currentPath = window.location.pathname;
            if (currentPath.includes('login.html') || currentPath.includes('register.html')) {
              showMessage('✅ Authentication successful! Redirecting...', false, 0);
              setTimeout(() => {
                safeRedirect('/index.html', 'auth state change');
              }, 800);
            }
          }
          break;
          
        case 'SIGNED_OUT':
          window.authState.session = null;
          const currentPath = window.location.pathname;
          if (!currentPath.includes('login.html') && !currentPath.includes('register.html')) {
            safeRedirect('/login.html', 'signed out');
          }
          break;
          
        case 'TOKEN_REFRESHED':
          console.log('[Auth] Token refreshed successfully');
          break;
      }
    });

    // Store listener for cleanup
    window.authStateListener = authListener;
  }

  // Main initialization
  (async () => {
    try {
      console.log('[Auth] Starting authentication system...');
      
      const client = await initializeSupabase();
      
      // Validate existing session
      const session = await validateSession(client);
      
      if (session) {
        console.log('[Auth] ✅ Existing valid session found');
        window.authState.session = session;
      }

      // Setup auth handlers
      setupAuth(client);

      console.log('[Auth] ✅ Authentication system ready');

    } catch (err) {
      console.error('[Auth] ❌ Authentication system failed to initialize:', err);
      
      // Show user-friendly error
      showMessage('Authentication system unavailable. Please refresh the page.', true, 0);
      
      // Fallback: try to redirect to login after delay
      setTimeout(() => {
        if (!window.authState.initialized) {
          safeRedirect('/login.html', 'initialization failed');
        }
      }, 5000);
    }
  })();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (window.authStateListener) {
      window.authStateListener.subscription.unsubscribe();
    }
  });

})();