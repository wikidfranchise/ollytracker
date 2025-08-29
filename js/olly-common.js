// OllyTracker Common Functions v1.2
const Olly = {
    async callSecApi(endpoint, payload) {
        // This will be a relative path to a serverless function on Vercel
        const PROXY_URL = '/api/sec-proxy'; 
        try {
            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: endpoint, payload: payload })
            });
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            console.error(`[Olly.callSecApi] Error:`, error);
            throw error;
        }
    },
    async protectPage() {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
            window.location.href = '/login.html';
            return null;
        }
        return data.session;
    },
    showOnboardingModal() {
        if (localStorage.getItem('ollyOnboardingComplete')) return;
        const modalHtml = `<div class="modal-overlay" id="onboarding-modal">...</div>`; // (Full modal content)
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        // ... (Event listener logic for the modal) ...
    }
    // ... (Other common functions like getFilingsCount, etc.) ...
};