// js/auth-enhanced.js — OllyPass-enabled Supabase auth with MFA and weekend carryover
(() => {
  'use strict';

  // Wait for Supabase UMD SDK to load
  function waitForSupabase(maxAttempts = 15, interval = 200) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        if (window.supabase?.createClient) {
          resolve(window.supabase.createClient);
          return;
        }
        if (++attempts >= maxAttempts) {
          reject(new Error('Supabase SDK not loaded'));
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  // Fetch keys securely from Vercel API route
  async function getSupabaseKeys() {
    const resp = await fetch('/api/keys');
    if (!resp.ok) throw new Error('Failed to fetch Supabase keys');
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await resp.json();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase keys missing from API response');
    }
    return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
  }

  // TOTP utilities for OllyPass
  function generateTOTPSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)];
    }
    return secret;
  }

  function generateQRCodeURL(secret, email) {
    const issuer = 'OllyTracker';
    const label = `${issuer}:${email}`;
    const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
  }

  // Simple TOTP verification (30-second window)
  function verifyTOTP(secret, token) {
    // This is a simplified implementation - in production you'd use a proper TOTP library
    const timeStep = Math.floor(Date.now() / 30000);
    // Check current and previous time step for clock drift tolerance
    for (let i = -1; i <= 1; i++) {
      const expectedToken = generateTOTPToken(secret, timeStep + i);
      if (expectedToken === token) return true;
    }
    return false;
  }

  function generateTOTPToken(secret, timeStep) {
    // Simplified TOTP generation - use proper crypto library in production
    const hash = simpleHMAC(secret, timeStep.toString());
    const offset = hash.charCodeAt(hash.length - 1) & 0xf;
    const code = ((hash.charCodeAt(offset) & 0x7f) << 24) |
                 ((hash.charCodeAt(offset + 1) & 0xff) << 16) |
                 ((hash.charCodeAt(offset + 2) & 0xff) << 8) |
                 (hash.charCodeAt(offset + 3) & 0xff);
    return (code % 1000000).toString().padStart(6, '0');
  }

  function simpleHMAC(key, message) {
    // Very simplified HMAC - use proper crypto in production
    return btoa(key + message).slice(0, 20);
  }

  // Device fingerprinting
  function getDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('OllyTracker Device ID', 2, 2);
    
    return btoa(JSON.stringify({
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas.toDataURL()
    })).slice(0, 32);
  }

  // Weekend carryover logic
  function isWeekendCarryover() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday
    const hour = now.getHours();
    
    // Monday before 8 AM
    if (day === 1 && hour < 8) {
      return true;
    }
    return false;
  }

  function shouldTrustDevice(lastTrusted) {
    if (!lastTrusted) return false;
    
    const now = new Date();
    const trusted = new Date(lastTrusted);
    const hoursDiff = (now - trusted) / (1000 * 60 * 60);
    
    // Normal 24-hour trust
    if (hoursDiff <= 24) return true;
    
    // Weekend carryover: Friday trust extends to Monday 8 AM
    if (isWeekendCarryover()) {
      const friday = new Date(trusted);
      friday.setDate(friday.getDate() - (friday.getDay() + 2) % 7); // Last Friday
      friday.setHours(0, 0, 0, 0);
      
      const mondayMorning = new Date(friday);
      mondayMorning.setDate(mondayMorning.getDate() + 3); // Monday
      mondayMorning.setHours(8, 0, 0, 0);
      
      if (trusted >= friday && now <= mondayMorning) {
        return true;
      }
    }
    
    return false;
  }

  // Rate limiting
  const rateLimiter = {
    attempts: new Map(),
    
    isBlocked(key) {
      const attempts = this.attempts.get(key) || [];
      const now = Date.now();
      const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000); // 15 minutes
      return recentAttempts.length >= 5;
    },
    
    recordAttempt(key) {
      const attempts = this.attempts.get(key) || [];
      attempts.push(Date.now());
      this.attempts.set(key, attempts);
    }
  };

  // Initialize Supabase client
  (async () => {
    try {
      const createClient = await waitForSupabase();
      const { url, key } = await getSupabaseKeys();

      const client = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        }
      });

      window.supabaseClient = client;
      window.supabase = client; // For admin console
      console.log('[Auth] Supabase initialized with OllyPass');

      // Wire up forms after client is ready
      setupAuth(client);
    } catch (err) {
      console.error('[Auth] Failed to initialize:', err);
    }
  })();

  function setupAuth(client) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // Message display helper
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
      } else {
        console.log(`[Auth] ${isError ? 'Error' : 'Success'}: ${text}`);
      }
    }

    // Disable form during processing
    function setFormDisabled(form, disabled) {
      if (!form) return;
      const inputs = form.querySelectorAll('input, button');
      inputs.forEach(input => input.disabled = disabled);
    }

    // Create MFA enrollment panel
    function createMFAEnrollmentPanel(secret, email) {
      const container = document.querySelector('.auth-container');
      const qrURL = generateQRCodeURL(secret, email);
      
      const panel = document.createElement('div');
      panel.id = 'ollypass-enrollment';
      panel.innerHTML = `
        <div style="margin-top: 30px; padding: 20px; border: 1px solid #4B5563; border-radius: 8px; background: rgba(31, 41, 55, 0.8);">
          <h3 style="color: #10B981; margin-bottom: 15px;">🔐 Complete OllyPass Setup</h3>
          <p style="margin-bottom: 20px;">Scan this QR code with your authenticator app:</p>
          
          <div style="text-align: center; margin: 20px 0;">
            <img src="${qrURL}" alt="OllyPass QR Code" style="background: white; padding: 10px; border-radius: 8px;"/>
          </div>
          
          <div style="margin: 20px 0; padding: 15px; background: #374151; border-radius: 6px;">
            <p style="margin: 0 0 10px 0; font-size: 14px;">Manual entry key:</p>
            <code style="word-break: break-all; font-size: 12px; color: #E5E7EB;">${secret}</code>
          </div>
          
          <div style="margin: 20px 0;">
            <label for="enrollment-code" style="display: block; margin-bottom: 8px;">Enter 6-digit code:</label>
            <input type="text" id="enrollment-code" maxlength="6" pattern="[0-9]{6}" 
                   style="width: 120px; text-align: center; font-size: 18px; letter-spacing: 2px; 
                          background: #374151; border: 1px solid #6B7280; color: #F9FAFB; 
                          padding: 12px; border-radius: 6px; font-family: monospace;"/>
          </div>
          
          <button id="verify-enrollment" style="background: #10B981; color: white; padding: 12px 24px; 
                                                border: none; border-radius: 6px; cursor: pointer; margin-right: 10px;">
            Complete Setup
          </button>
          <button id="cancel-enrollment" style="background: transparent; border: 1px solid #6B7280; 
                                                color: #D1D5DB; padding: 12px 24px; border-radius: 6px; cursor: pointer;">
            Cancel
          </button>
        </div>
      `;
      
      container.appendChild(panel);
      return panel;
    }

    // Create MFA verification panel
    function createMFAVerificationPanel() {
      const container = document.querySelector('.auth-container');
      
      const panel = document.createElement('div');
      panel.id = 'ollypass-verification';
      panel.innerHTML = `
        <div style="margin-top: 30px; padding: 20px; border: 1px solid #4B5563; border-radius: 8px; background: rgba(31, 41, 55, 0.8);">
          <h3 style="color: #10B981; margin-bottom: 15px;">🔐 OllyPass Verification</h3>
          <p style="margin-bottom: 20px;">Enter your 6-digit authenticator code:</p>
          
          <div style="margin: 20px 0;">
            <input type="text" id="verification-code" maxlength="6" pattern="[0-9]{6}" 
                   style="width: 120px; text-align: center; font-size: 18px; letter-spacing: 2px; 
                          background: #374151; border: 1px solid #6B7280; color: #F9FAFB; 
                          padding: 12px; border-radius: 6px; font-family: monospace;"/>
          </div>
          
          <button id="verify-code" style="background: #10B981; color: white; padding: 12px 24px; 
                                         border: none; border-radius: 6px; cursor: pointer;">
            Verify & Continue
          </button>
          
          ${isWeekendCarryover() ? '<p style="margin-top: 15px; color: #10B981; font-size: 14px;">🌅 Weekend carryover active - extended trust period</p>' : ''}
        </div>
      `;
      
      container.appendChild(panel);
      return panel;
    }

    // Redirect to app
    function redirectToApp() {
      showMessage('Success! Redirecting...');
      setTimeout(() => {
        window.location.replace('/index.html');
      }, 500);
    }

    // LOGIN handler with OllyPass
    async function handleLogin(e) {
      e.preventDefault();
      const form = e.target;

      const email = form.querySelector('#email')?.value?.trim();
      const password = form.querySelector('#password')?.value;

      if (!email || !password) {
        showMessage('Email and password are required', true);
        return;
      }

      if (rateLimiter.isBlocked(email)) {
        showMessage('Too many attempts. Please try again in 15 minutes.', true);
        return;
      }

      setFormDisabled(form, true);
      showMessage('Signing in...');

      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
          rateLimiter.recordAttempt(email);
          showMessage(error.message, true);
          setFormDisabled(form, false);
          return;
        }

        if (!data.session) {
          showMessage('Authentication failed - no session created', true);
          setFormDisabled(form, false);
          return;
        }

        // Check if user has OllyPass enabled
        const user = data.user;
        const ollypassSecret = user.user_metadata?.ollypass_secret;
        
        if (!ollypassSecret) {
          // No MFA setup - redirect directly
          redirectToApp();
          return;
        }

        // Check device trust
        const deviceId = getDeviceFingerprint();
        const trustedDevices = user.user_metadata?.trusted_devices || {};
        const lastTrusted = trustedDevices[deviceId];

        if (shouldTrustDevice(lastTrusted)) {
          showMessage('Trusted device recognized. Welcome back!');
          redirectToApp();
          return;
        }

        // Require MFA verification
        form.style.display = 'none';
        const verificationPanel = createMFAVerificationPanel();
        
        document.getElementById('verify-code').addEventListener('click', async () => {
          const code = document.getElementById('verification-code').value;
          
          if (!code || code.length !== 6) {
            showMessage('Please enter a 6-digit code', true);
            return;
          }

          if (verifyTOTP(ollypassSecret, code)) {
            // Update trusted device
            const updatedDevices = { ...trustedDevices };
            updatedDevices[deviceId] = new Date().toISOString();
            
            await client.auth.updateUser({
              data: { trusted_devices: updatedDevices }
            });

            showMessage('MFA verified successfully!');
            redirectToApp();
          } else {
            rateLimiter.recordAttempt(email);
            showMessage('Invalid code. Please try again.', true);
          }
        });

      } catch (err) {
        console.error('[Auth] Login error:', err);
        showMessage('Login failed: ' + (err.message || 'Unknown error'), true);
        setFormDisabled(form, false);
      }
    }

    // REGISTER handler with OllyPass enrollment
    async function handleRegister(e) {
      e.preventDefault();
      const form = e.target;

      const email = form.querySelector('#email')?.value?.trim();
      const password = form.querySelector('#password')?.value;
      const confirmPassword = form.querySelector('#confirmPassword')?.value;
      const fullName = form.querySelector('#full_name, #fullname')?.value?.trim() || '';
      const organization = form.querySelector('#organization')?.value?.trim() || '';

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
        // Generate OllyPass secret
        const ollypassSecret = generateTOTPSecret();
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + 45); // 45-day trial

        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { 
            data: { 
              fullname: fullName,
              organization: organization,
              ollypass_secret: ollypassSecret,
              trial_ends: trialEnds.toISOString(),
              trusted_devices: {}
            } 
          }
        });

        if (error) {
          showMessage(error.message, true);
          setFormDisabled(form, false);
          return;
        }

        if (!data.session) {
          showMessage('Please check your email to confirm your account', false);
          setFormDisabled(form, false);
          return;
        }

        // Show MFA enrollment
        form.style.display = 'none';
        const enrollmentPanel = createMFAEnrollmentPanel(ollypassSecret, email);
        
        document.getElementById('verify-enrollment').addEventListener('click', async () => {
          const code = document.getElementById('enrollment-code').value;
          
          if (!code || code.length !== 6) {
            showMessage('Please enter a 6-digit code', true);
            return;
          }

          if (verifyTOTP(ollypassSecret, code)) {
            // Trust this device
            const deviceId = getDeviceFingerprint();
            const trustedDevices = {};
            trustedDevices[deviceId] = new Date().toISOString();
            
            await client.auth.updateUser({
              data: { trusted_devices: trustedDevices }
            });

            showMessage('OllyPass setup complete! Welcome to OllyTracker.');
            redirectToApp();
          } else {
            showMessage('Invalid code. Please try again.', true);
          }
        });

        document.getElementById('cancel-enrollment').addEventListener('click', () => {
          enrollmentPanel.remove();
          form.style.display = 'block';
          setFormDisabled(form, false);
        });

      } catch (err) {
        console.error('[Auth] Registration error:', err);
        showMessage('Registration failed: ' + (err.message || 'Unknown error'), true);
        setFormDisabled(form, false);
      }
    }

    // Wire up forms
    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);

      client.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          showMessage('Already signed in. Redirecting...');
          redirectToApp();
        }
      });

      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          redirectToApp();
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', handleRegister);
    }
  }

  // ------------------ ADMIN CONSOLE SUPPORT ------------------ //
  document.addEventListener("DOMContentLoaded", async () => {
    if (window.location.pathname.includes("admin-console.html")) {
      console.log("Admin Console detected — loading users...");

      const tbody = document.getElementById("user-list");
      const errorBox = document.getElementById("error-message");
      const successBox = document.getElementById("success-message");

      try {
        // Note: This requires service role key for production
        // For now, we'll show a placeholder message
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 20px; color: #9CA3AF;">
              Admin functionality requires service role configuration.<br/>
              Contact system administrator to enable user management.
            </td>
          </tr>
        `;

        // In production, you would:
        // const { data: { users }, error } = await supabase.auth.admin.listUsers();
        // if (error) throw error;
        // 
        // users.forEach(user => {
        //   const fullName = user.user_metadata?.fullname || "—";
        //   const org = user.user_metadata?.organization || "—";
        //   const mfaEnabled = user.user_metadata?.ollypass_secret ? "Enabled" : "Disabled";
        //   const trialEnds = user.user_metadata?.trial_ends || "—";
        //   const status = user.banned_until ? "Revoked" : "Active";
        //   
        //   const row = document.createElement("tr");
        //   row.innerHTML = `
        //     <td>${user.email}</td>
        //     <td>${fullName}</td>
        //     <td>${org}</td>
        //     <td>${status}</td>
        //     <td>${mfaEnabled}</td>
        //     <td>${trialEnds}</td>
        //     <td>
        //       <button class="action-btn reset-mfa" data-id="${user.id}">Reset MFA</button>
        //       <button class="action-btn danger revoke" data-id="${user.id}">Revoke</button>
        //     </td>
        //   `;
        //   tbody.appendChild(row);
        // });

      } catch (err) {
        console.error("Admin fetch error:", err);
        if (errorBox) {
          errorBox.textContent = "Unable to fetch users: " + err.message;
          errorBox.style.display = "block";
        }
      }
    }
  });

})();