// Global variables
let farcasterSDK = null;
let currentUser = null;
const STORAGE_KEY = 'scheduled_casts';
const DRAFT_KEY = 'cast_draft';

// Initialize the app
window.initializeApp = async function() {
    try {
        farcasterSDK = window.farcasterSDK;
        
        if (farcasterSDK && farcasterSDK.actions) {
            console.log('✅ Farcaster SDK loaded');
            await farcasterSDK.actions.ready();
            console.log('✅ SDK ready called');
            
            // Only try to add mini app if on production domain (not tunnel/dev)
            await tryAddMiniApp();
        }
        
        setupApp();
        
    } catch (error) {
        console.error('❌ SDK error:', error);
        setupApp();
    }
};

// Proper addMiniApp implementation following documentation
async function tryAddMiniApp() {
    try {
        // Check if we're on a valid domain (not tunnel/dev)
        const currentDomain = window.location.hostname;
        console.log('Current domain:', currentDomain);
        
        // Skip addMiniApp for tunnel domains or localhost
        if (currentDomain.includes('ngrok') || 
            currentDomain.includes('localtunnel') || 
            currentDomain === 'localhost' || 
            currentDomain === '127.0.0.1') {
            console.log('⚠️ Skipping addMiniApp - tunnel/dev domain detected');
            return;
        }
        
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.addMiniApp) {
            await farcasterSDK.actions.addMiniApp();
            console.log('✅ Mini app added successfully');
            showStatus('📌 Added to your apps!', 'success');
        }
    } catch (error) {
        if (error.message === 'RejectedByUser') {
            console.log('User declined to add mini app');
        } else if (error.message === 'InvalidDomainManifestJson') {
            console.error('❌ Domain/manifest error - check farcaster.json matches domain');
        } else {
            console.error('Add mini app error:', error);
        }
    }
}

// Setup app functionality
function setupApp() {
    setupEventListeners();
    loadScheduledPosts();
    setMinDateTime();
    startScheduleChecker();
    loadDraft();
    
    // Check if user is already authenticated
    checkAuthStatus();
}

function setupEventListeners() {
    // Sign in button
    document.getElementById('signin-btn').onclick = handleSignIn;
    
    // Manual mode button
    document.getElementById('manual-mode-btn').onclick = () => {
        showMainApp();
        showStatus('📱 Manual mode - you\'ll get notifications when posts are ready', 'success');
    };
    
    // Form submission
    document.getElementById('schedule-form').onsubmit = handleScheduleSubmit;
    
    // Character count update
    document.getElementById('cast-content').oninput = updateCharCount;
    updateCharCount();
}

// Check authentication status
async function checkAuthStatus() {
    try {
        if (farcasterSDK && farcasterSDK.actions) {
            const user = await farcasterSDK.actions.getUserData();
            if (user && user.fid) {
                console.log('✅ User already authenticated:', user);
                currentUser = user;
                updateConnectionStatus(user);
                showMainApp();
                await setupAutoPosting(user);
                return;
            }
        }
    } catch (error) {
        console.log('No existing auth:', error.message);
    }
    
    // Show auth section if not authenticated
    showAuthSection();
}

// Proper signIn implementation following official documentation
async function handleSignIn() {
    const btn = document.getElementById('signin-btn');
    const originalText = btn.innerHTML;
    
    try {
        btn.innerHTML = '🔄 Signing In...';
        btn.disabled = true;
        
        if (!farcasterSDK || !farcasterSDK.actions) {
            throw new Error('Please open this app from within Farcaster/Warpcast');
        }
        
        console.log('🔐 Starting Farcaster sign-in...');
        
        // Generate a proper nonce (at least 8 characters)
        const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Use the official signIn method from documentation
        const signInResult = await farcasterSDK.actions.signIn({
            nonce: nonce
        });
        
        console.log('✅ Sign-in successful:', signInResult);
        
        // Validate the sign-in result
        if (!signInResult || !signInResult.signature || !signInResult.message) {
            throw new Error('Invalid sign-in response');
        }
        
        // Get user data after successful sign-in
        const user = await farcasterSDK.actions.getUserData();
        
        if (!user || !user.fid) {
            throw new Error('Could not get user data after sign-in');
        }
        
        console.log('✅ User data retrieved:', user);
        
        // Store authentication data
        currentUser = user;
        localStorage.setItem('user_fid', user.fid.toString());
        localStorage.setItem('user_username', user.username || user.displayName || 'Unknown');
        localStorage.setItem('signin_signature', signInResult.signature);
        localStorage.setItem('signin_message', signInResult.message);
        localStorage.setItem('signin_nonce', nonce);
        localStorage.setItem('auth_timestamp', new Date().toISOString());
        
        // Update UI
        updateConnectionStatus(user);
        showMainApp();
        
        // Setup auto-posting with sign-in data
        await setupAutoPosting(user, signInResult);
        
        btn.innerHTML = '✅ Signed In!';
        btn.style.background = '#10B981';
        
        showStatus('🎉 Successfully signed in with Farcaster!', 'success');
        
    } catch (error) {
        console.error('❌ Sign-in failed:', error);
        
        let errorMessage = 'Sign-in failed. ';
        if (error.message.includes('Please open this app')) {
            errorMessage += 'Please open this app from within Farcaster/Warpcast.';
        } else if (error.message === 'RejectedByUser') {
            errorMessage += 'You rejected the sign-in request.';
        } else if (error.message.includes('Invalid sign-in response')) {
            errorMessage += 'Authentication response was invalid.';
        } else {
            errorMessage += 'Please try again or use manual mode.';
        }
        
        showStatus(`❌ ${errorMessage}`, 'error');
        
        // Reset button
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.style.background = '';
    }
}

// Enhanced auto-posting setup with sign-in data
async function setupAutoPosting(user, signInResult = null) {
    try {
        console.log('🔧 Setting up auto-posting for FID:', user.fid);
        
        showStatus('🔧 Setting up automatic posting...', 'success');
        
        const payload = {
            fid: user.fid,
            username: user.username || user.displayName || 'Unknown'
        };
        
        // Include sign-in authentication data if available
        if (signInResult && signInResult.signature && signInResult.message) {
            payload.signature = signInResult.signature;
            payload.message = signInResult.message;
            payload.nonce = localStorage.getItem('signin_nonce');
            console.log('📝 Including sign-in authentication data');
        }
        
        const response = await fetch('/api/create-signer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📡 Signer creation result:', result);
        
        if (result.success && result.signerUuid) {
            localStorage.setItem('user_signer_uuid', result.signerUuid);
            console.log('✅ Auto-posting enabled');
            showStatus('🤖 Auto-posting enabled! Your casts will post automatically.', 'success');
        } else {
            console.log('⚠️ Auto-posting setup failed:', result.error);
            showStatus('📱 Manual mode - you\'ll get notifications when posts are ready.', 'success');
        }
    } catch (error) {
        console.error('❌ Auto-posting setup error:', error);
        showStatus('📱 Manual mode - you\'ll get notifications when posts are ready.', 'success');
    }
}

// UI state management
function showAuthSection() {
    document.getElementById('auth-section').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
}

function updateConnectionStatus(user) {
    const statusEl = document.getElementById('connection-status');
    if (user && (user.username || user.displayName)) {
        const username = user.username || user.displayName;
        statusEl.innerHTML = `● @${username}`;
        statusEl.style.display = 'block';
    }
}

// Quick time helpers
function setQuickTime(hours) {
    const future = new Date();
    future.setHours(future.getHours() + hours);
    document.getElementById('schedule-time').value = future.toISOString().slice(0, 16);
}

// Form handling
function handleScheduleSubmit(e) {
    e.preventDefault();
    
    const content = document.getElementById('cast-content').value.trim();
    const scheduleTime = document.getElementById('schedule-time').value;
    
    if (!content) {
        showStatus('❌ Please enter cast content', 'error');
        return;
    }
    
    if (!scheduleTime) {
        showStatus('❌ Please select schedule time', 'error');
        return;
    }
    
    const scheduledDate = new Date(scheduleTime);
    const now = new Date();
    
    if (scheduledDate <= now) {
        showStatus('❌ Schedule time must be in future', 'error');
        return;
    }
    
    const post = {
        id: Date.now().toString(),
        content: content,
        scheduleTime: scheduleTime,
        created: new Date().toISOString(),
        status: 'scheduled'
    };
    
    saveScheduledPost(post);
    clearForm();
    loadScheduledPosts();
    
    const hasAutoPost = localStorage.getItem('user_signer_uuid');
    const message = hasAutoPost ? 
        '🎉 Scheduled! Will auto-post at the right time.' : 
        '🎉 Scheduled! You\'ll get notified when ready.';
    showStatus(message, 'success');
}

// Storage functions
function saveScheduledPost(post) {
    const posts = getScheduledPosts();
    posts.push(post);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function getScheduledPosts() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
}

function loadScheduledPosts() {
    const posts = getScheduledPosts()
        .filter(post => post.status === 'scheduled')
        .sort((a, b) => new Date(a.scheduleTime) - new Date(b.scheduleTime));
    
    const container = document.getElementById('scheduled-list');
    
    if (posts.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #6B7280; padding: 20px; font-size: 13px;">No scheduled posts yet</div>';
        return;
    }
    
    const hasAutoPost = localStorage.getItem('user_signer_uuid');
    const badge = hasAutoPost ? '🤖 Auto' : '📱 Manual';
    
    container.innerHTML = posts.map(post => `
        <div class="post-item">
            <div class="post-content">${escapeHtml(post.content)}</div>
            <div class="post-time">📅 ${formatDateTime(post.scheduleTime)} • ${badge}</div>
            <button class="delete-btn" onclick="deletePost('${post.id}')">×</button>
        </div>
    `).join('');
}

function deletePost(id) {
    const posts = getScheduledPosts().filter(post => post.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    loadScheduledPosts();
    showStatus('🗑️ Deleted', 'success');
}

// Draft management
function saveDraft() {
    const content = document.getElementById('cast-content').value.trim();
    const scheduleTime = document.getElementById('schedule-time').value;
    
    if (!content && !scheduleTime) {
        showStatus('❌ Nothing to save', 'error');
        return;
    }
    
    const draft = { content, scheduleTime, savedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    showStatus('💾 Draft saved!', 'success');
}

function loadDraft() {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
        const { content, scheduleTime } = JSON.parse(draft);
        if (content) document.getElementById('cast-content').value = content;
        if (scheduleTime) document.getElementById('schedule-time').value = scheduleTime;
        updateCharCount();
    }
}

function clearForm() {
    document.getElementById('cast-content').value = '';
    document.getElementById('schedule-time').value = '';
    updateCharCount();
    localStorage.removeItem(DRAFT_KEY);
}

// Character count
function updateCharCount() {
    const textarea = document.getElementById('cast-content');
    const counter = document.getElementById('char-count');
    const length = textarea.value.length;
    
    counter.textContent = `${length}/320`;
    counter.style.color = length > 280 ? '#EF4444' : length > 250 ? '#F59E0B' : '#6B7280';
}

// Utility functions
function setMinDateTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    document.getElementById('schedule-time').min = now.toISOString().slice(0, 16);
}

function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status-bar ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
        status.style.display = 'none';
    }, 4000);
}

// Schedule checker for auto-posting
function startScheduleChecker() {
    setInterval(checkScheduledPosts, 60000);
}

function checkScheduledPosts() {
    const posts = getScheduledPosts();
    const now = new Date();
    
    posts.forEach(post => {
        if (post.status === 'scheduled') {
            const scheduleTime = new Date(post.scheduleTime);
            if (scheduleTime <= now) {
                publishPost(post);
            }
        }
    });
}

// Auto-publish or manual notification
async function publishPost(post) {
    const signerUuid = localStorage.getItem('user_signer_uuid');
    
    if (signerUuid) {
        // Try auto-posting
        try {
            console.log('🚀 Attempting auto-publish for:', post.content.substring(0, 50));
            
            const response = await fetch('/api/publish-cast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: post.content,
                    signerUuid: signerUuid
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Mark as published
                const posts = getScheduledPosts();
                const updatedPosts = posts.map(p => 
                    p.id === post.id ? { 
                        ...p, 
                        status: 'published', 
                        publishedAt: new Date().toISOString(),
                        castHash: result.castHash,
                        castUrl: result.castUrl
                    } : p
                );
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
                loadScheduledPosts();
                
                showStatus('🎉 Cast published automatically!', 'success');
                
                // Browser notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('✅ Cast Published!', {
                        body: `"${post.content.substring(0, 50)}..." was posted to Farcaster`,
                        icon: '/icon.png'
                    });
                }
                return;
            }
        } catch (error) {
            console.error('Auto-publish failed:', error);
        }
    }
    
    // Fallback to manual notification
    showStatus('🔔 A scheduled post is ready!', 'success');
    
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⏰ Cast Ready!', {
            body: `Time to post: "${post.content.substring(0, 50)}..."`,
            icon: '/icon.png',
            requireInteraction: true
        });
    }
    
    // Open composer
    try {
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.composeCast) {
            await farcasterSDK.actions.composeCast({ text: post.content });
        } else {
            window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(post.content)}`, '_blank');
        }
    } catch (error) {
        console.error('Failed to open composer:', error);
    }
}

// Share functionality
async function shareApp() {
    const appUrl = window.location.href;
    const shareText = `🚀 Never miss optimal posting times! 

📅 Cast Scheduler helps you schedule posts for peak engagement and maximize your Farcaster reach.

✨ Try it: ${appUrl}`;

    try {
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.composeCast) {
            await farcasterSDK.actions.composeCast({ text: shareText });
            return;
        }
    } catch (error) {
        console.log('SDK share failed');
    }

    // Fallback to clipboard
    if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        showStatus('📋 Share text copied!', 'success');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (typeof window.initializeApp === 'function') {
            window.initializeApp();
        }
    }, 100);
});
