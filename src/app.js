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
            
            // Automatically try to add mini app using official action
            await promptAddMiniApp();
        }
        
        setupApp();
        
    } catch (error) {
        console.error('❌ SDK error:', error);
        setupApp();
    }
};

// Use official addMiniApp action instead of custom popup
async function promptAddMiniApp() {
    try {
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.addMiniApp) {
            // Use the official SDK action directly - no custom popup needed
            await farcasterSDK.actions.addMiniApp();
            console.log('✅ Mini app added successfully');
            showStatus('📌 Added to your apps!', 'success');
        }
    } catch (error) {
        if (error.message === 'RejectedByUser') {
            console.log('User declined to add mini app');
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

// Enhanced authentication status check with SIWF session validation
async function checkAuthStatus() {
    try {
        // Check if we have stored SIWF authentication
        const storedSignature = localStorage.getItem('siwf_signature');
        const storedMessage = localStorage.getItem('siwf_message');
        const storedFid = localStorage.getItem('user_fid');
        const authTimestamp = localStorage.getItem('auth_timestamp');
        
        // Check if authentication is still valid (within 24 hours)
        if (authTimestamp) {
            const authAge = Date.now() - new Date(authTimestamp).getTime();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            
            if (authAge > maxAge) {
                console.log('🔄 Authentication expired, clearing stored data');
                clearAuthData();
                showAuthSection();
                return;
            }
        }
        
        // Try to get current user data from SDK
        if (farcasterSDK && farcasterSDK.actions && storedSignature && storedMessage && storedFid) {
            const user = await farcasterSDK.actions.getUserData();
            if (user && user.fid && user.fid.toString() === storedFid) {
                console.log('✅ Existing SIWF session verified');
                currentUser = user;
                updateConnectionStatus(user);
                showMainApp();
                
                // Check if auto-posting is set up
                const signerUuid = localStorage.getItem('user_signer_uuid');
                if (signerUuid) {
                    showStatus('🤖 Auto-posting enabled!', 'success');
                } else {
                    await setupAutoPosting(user);
                }
                return;
            }
        }
        
        // Fallback: try simple getUserData for existing sessions
        if (farcasterSDK && farcasterSDK.actions) {
            const user = await farcasterSDK.actions.getUserData();
            if (user && user.fid) {
                currentUser = user;
                updateConnectionStatus(user);
                showMainApp();
                await setupAutoPosting(user);
                return;
            }
        }
    } catch (error) {
        console.log('❌ Auth status check failed:', error.message);
        clearAuthData();
    }
    
    // Show auth section if not authenticated
    showAuthSection();
}

// Fixed Farcaster sign-in handler using official SIWF method
async function handleSignIn() {
    const btn = document.getElementById('signin-btn');
    const originalText = btn.innerHTML;
    
    try {
        btn.innerHTML = '🔄 Connecting...';
        btn.disabled = true;
        
        if (!farcasterSDK || !farcasterSDK.actions) {
            throw new Error('Please open this app from within Farcaster/Warpcast');
        }
        
        console.log('🔐 Starting SIWF authentication...');
        
        // Generate a secure nonce (at least 8 alphanumeric characters)
        const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        let user = null;
        let signInResult = null;
        
        try {
            // Method 1: Try the official signIn method with proper SIWF parameters
            if (farcasterSDK.actions.signIn) {
                console.log('Attempting SIWF signIn...');
                signInResult = await farcasterSDK.actions.signIn({
                    nonce: nonce,
                    acceptAuthAddress: true // Enable for better UX as per docs
                });
                
                console.log('✅ SIWF sign-in successful:', signInResult);
                
                // Validate the signIn response
                if (!signInResult || !signInResult.signature || !signInResult.message) {
                    throw new Error('Invalid sign-in response from Farcaster');
                }
                
                // Now get user data after successful sign-in
                user = await farcasterSDK.actions.getUserData();
                
                if (user && user.fid) {
                    console.log('✅ User data retrieved after SIWF:', user);
                }
            }
        } catch (signInError) {
            console.log('SIWF signIn failed, trying fallback methods:', signInError.message);
        }
        
        // Method 2: Fallback to getUserData if signIn failed
        if (!user || !user.fid) {
            try {
                console.log('Trying getUserData fallback...');
                user = await farcasterSDK.actions.getUserData();
                if (user && user.fid) {
                    console.log('✅ getUserData fallback successful:', user);
                }
            } catch (getUserError) {
                console.log('getUserData fallback failed:', getUserError.message);
            }
        }
        
        // Final validation
        if (!user || !user.fid) {
            throw new Error('Could not authenticate with Farcaster. Please make sure you are signed into Warpcast and try again.');
        }
        
        console.log('✅ Authentication successful:', user);
        
        // Store user info and SIWF data
        currentUser = user;
        localStorage.setItem('user_fid', user.fid.toString());
        localStorage.setItem('user_username', user.username || user.displayName || 'Unknown');
        localStorage.setItem('auth_timestamp', new Date().toISOString());
        
        // Store SIWF authentication data if available
        if (signInResult && signInResult.signature && signInResult.message) {
            localStorage.setItem('siwf_signature', signInResult.signature);
            localStorage.setItem('siwf_message', signInResult.message);
            localStorage.setItem('siwf_nonce', nonce);
            console.log('📝 SIWF authentication data stored');
        }
        
        // Update UI
        updateConnectionStatus(user);
        showMainApp();
        
        // Setup auto-posting with authenticated data
        await setupAutoPosting(user, signInResult);
        
        btn.innerHTML = '✅ Connected!';
        btn.style.background = '#10B981';
        
        showStatus('🎉 Successfully signed in with Farcaster!', 'success');
        
    } catch (error) {
        console.error('❌ SIWF authentication failed:', error);
        
        // Enhanced error handling
        let errorMessage = 'Sign-in failed. ';
        if (error.message.includes('Please open this app')) {
            errorMessage += 'Please open this app from within Farcaster/Warpcast.';
        } else if (error.message.includes('RejectedByUser')) {
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

// Enhanced auto-posting setup with SIWF data
async function setupAutoPosting(user, signInResult = null) {
    try {
        console.log('🔧 Setting up auto-posting with SIWF for FID:', user.fid);
        
        showStatus('🔧 Setting up automatic posting...', 'success');
        
        const payload = {
            fid: user.fid,
            username: user.username || user.displayName
        };
        
        // Include SIWF authentication data if available
        if (signInResult && signInResult.signature && signInResult.message) {
            payload.siwf_signature = signInResult.signature;
            payload.siwf_message = signInResult.message;
            payload.nonce = localStorage.getItem('siwf_nonce');
            console.log('📝 Including SIWF authentication data in signer creation');
        }
        
        const response = await fetch('/api/create-signer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📡 Signer creation result:', result);
        
        if (result.success && result.signerUuid) {
            localStorage.setItem('user_signer_uuid', result.signerUuid);
            console.log('✅ Auto-posting enabled with signer:', result.signerUuid);
            showStatus('🤖 Auto-posting enabled! Your scheduled casts will post automatically.', 'success');
        } else {
            console.log('⚠️ Auto-posting setup failed:', result.error);
            showStatus('⚠️ Auto-posting setup failed. Manual posting will be used.', 'error');
        }
    } catch (error) {
        console.error('❌ Auto-posting setup error:', error);
        showStatus('⚠️ Auto-posting unavailable. You\'ll get manual notifications.', 'error');
    }
}

// Helper function to clear authentication data
function clearAuthData() {
    localStorage.removeItem('siwf_signature');
    localStorage.removeItem('siwf_message');
    localStorage.removeItem('siwf_nonce');
    localStorage.removeItem('user_fid');
    localStorage.removeItem('user_username');
    localStorage.removeItem('user_signer_uuid');
    localStorage.removeItem('auth_timestamp');
    currentUser = null;
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

// Enhanced auto-publish with better error handling
async function publishPost(post) {
    const signerUuid = localStorage.getItem('user_signer_uuid');
    
    if (signerUuid) {
        // Try auto-posting
        try {
            console.log('🚀 Attempting auto-publish via Neynar API for:', post.content.substring(0, 50));
            
            const response = await fetch('/api/publish-cast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: post.content,
                    signerUuid: signerUuid
                })
            });
            
            const result = await response.json();
            console.log('📡 Neynar API response:', result);
            
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
            } else {
                console.error('❌ Auto-publish failed:', result.error);
            }
        } catch (error) {
            console.error('❌ Auto-publish error:', error);
        }
    }
    
    // Fallback to manual notification
    console.log('🔄 Falling back to manual notification');
    showStatus('🔔 A scheduled post is ready!', 'success');
    
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⏰ Cast Ready!', {
            body: `Time to post: "${post.content.substring(0, 50)}..."`,
            icon: '/icon.png',
            requireInteraction: true
        });
    }
    
    // Try to open Warpcast composer
    try {
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.composeCast) {
            await farcasterSDK.actions.composeCast({ text: post.content });
        } else {
            window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(post.content)}`, '_blank');
        }
        
        // Mark as manually posted
        const posts = getScheduledPosts();
        const updatedPosts = posts.map(p => 
            p.id === post.id ? { ...p, status: 'posted_manually', postedAt: new Date().toISOString() } : p
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
        loadScheduledPosts();
        
    } catch (composerError) {
        console.error('❌ Failed to open composer:', composerError);
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
