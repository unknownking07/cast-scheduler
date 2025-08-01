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

// Check if user is already authenticated
async function checkAuthStatus() {
    try {
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
        console.log('No existing auth:', error.message);
    }
    
    // Show auth section if not authenticated
    showAuthSection();
}

// Handle sign in with Farcaster
async function handleSignIn() {
    const btn = document.getElementById('signin-btn');
    const originalText = btn.innerHTML;
    
    try {
        btn.innerHTML = '🔄 Connecting...';
        btn.disabled = true;
        
        // Generate nonce for security
        const nonce = Math.random().toString(36).substring(2, 15);
        
        if (farcasterSDK && farcasterSDK.actions) {
            // Try different authentication methods
            let authResult;
            
            try {
                // Method 1: Try signIn if available
                if (farcasterSDK.actions.signIn) {
                    authResult = await farcasterSDK.actions.signIn({
                        nonce: nonce,
                    });
                }
            } catch (signInError) {
                console.log('SignIn method failed, trying getUserData');
                // Method 2: Fallback to getUserData
                authResult = await farcasterSDK.actions.getUserData();
            }
            
            if (authResult && (authResult.fid || authResult.user?.fid)) {
                const user = authResult.user || authResult;
                currentUser = user;
                
                updateConnectionStatus(user);
                showMainApp();
                await setupAutoPosting(user);
                showStatus('🎉 Connected successfully!', 'success');
            } else {
                throw new Error('Failed to get user data');
            }
        } else {
            throw new Error('Farcaster SDK not available');
        }
        
    } catch (error) {
        console.error('Sign in failed:', error);
        showStatus('❌ Connection failed. Try manual mode.', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Setup automatic posting with Neynar
async function setupAutoPosting(user) {
    try {
        console.log('Setting up auto-posting for FID:', user.fid);
        
        const response = await fetch('/api/create-signer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fid: user.fid })
        });
        
        const result = await response.json();
        
        if (result.success && result.signerUuid) {
            localStorage.setItem('user_signer_uuid', result.signerUuid);
            localStorage.setItem('user_fid', user.fid);
            localStorage.setItem('user_username', user.username || user.displayName || 'Unknown');
            
            console.log('✅ Auto-posting enabled');
            showStatus('🤖 Auto-posting enabled!', 'success');
        } else {
            console.log('⚠️ Auto-posting setup failed:', result.error);
        }
    } catch (error) {
        console.error('Auto-posting setup error:', error);
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
    if (user && user.username) {
        statusEl.innerHTML = `● @${user.username}`;
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

// Auto-publish or notify
async function publishPost(post) {
    const signerUuid = localStorage.getItem('user_signer_uuid');
    
    if (signerUuid) {
        // Try auto-posting
        try {
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
                    p.id === post.id ? { ...p, status: 'published', publishedAt: new Date().toISOString() } : p
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
            icon: '/icon.png'
        });
    }
    
    // Open Warpcast composer
    if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.composeCast) {
        try {
            await farcasterSDK.actions.composeCast({ text: post.content });
        } catch (error) {
            window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(post.content)}`, '_blank');
        }
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
