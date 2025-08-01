// Global variables
let farcasterSDK = null;
const STORAGE_KEY = 'scheduled_casts';
const DRAFT_KEY = 'cast_draft';

// Initialize the app - following official documentation
window.initializeApp = async function() {
    try {
        // Get SDK from window (loaded via CDN)
        farcasterSDK = window.farcasterSDK;
        
        if (farcasterSDK && farcasterSDK.actions) {
            console.log('✅ Farcaster SDK loaded successfully');
            
            // CRITICAL: Call ready() to hide splash screen - REQUIRED by docs
            await farcasterSDK.actions.ready();
            console.log('✅ sdk.actions.ready() called successfully');
            
            // Try to add the mini app to user's collection
            await promptAddMiniApp();
            
            // Setup auto-posting authentication - THIS IS KEY FOR NEYNAR
            await setupNeynarAuth();
            
            showStatus('🎉 Cast Scheduler loaded in Farcaster!', 'success');
        } else {
            console.log('ℹ️ Running in standalone browser mode');
            showStatus('📱 Running in browser mode - manual posting only', 'success');
        }
    } catch (error) {
        console.error('❌ SDK initialization error:', error);
        showStatus('⚠️ Running in compatibility mode', 'success');
    }
    
    // Setup the app regardless of SDK status
    setupApp();
};

// Enhanced setup for Neynar authentication with proper connection flow
async function setupNeynarAuth() {
    try {
        if (!farcasterSDK || !farcasterSDK.actions) {
            console.log('⚠️ Farcaster SDK not available - manual mode only');
            showStatus('📱 Manual posting mode - you\'ll get notifications when it\'s time to post', 'success');
            return;
        }

        console.log('🔐 Checking existing Farcaster connection...');
        
        // Check if we already have a connection
        const existingSigner = localStorage.getItem('user_signer_uuid');
        const existingFid = localStorage.getItem('user_fid');
        
        if (existingSigner && existingFid) {
            console.log('✅ Existing connection found - FID:', existingFid);
            
            // Verify the connection still works
            try {
                const user = await farcasterSDK.actions.getUserData();
                if (user && user.fid && user.fid.toString() === existingFid) {
                    console.log('✅ Connection verified and active');
                    showStatus('🤖 Auto-posting enabled! Your scheduled casts will post automatically.', 'success');
                    updateConnectionStatus();
                    return;
                }
            } catch (verifyError) {
                console.log('⚠️ Connection verification failed, will re-connect');
                // Clear old connection data
                localStorage.removeItem('user_signer_uuid');
                localStorage.removeItem('user_fid');
                localStorage.removeItem('user_username');
            }
        }
        
        // Check if user is currently authenticated
        let user;
        try {
            user = await farcasterSDK.actions.getUserData();
        } catch (error) {
            console.log('❌ User not authenticated, showing connection modal');
        }
        
        if (!user || !user.fid) {
            // Show connection modal instead of just info modal
            console.log('🔗 Showing Farcaster connection modal');
            showFarcasterConnectModal();
            return;
        }

        // User is authenticated, set up auto-posting directly
        console.log('✅ User authenticated - FID:', user.fid, 'Username:', user.username);
        localStorage.setItem('user_fid', user.fid);
        localStorage.setItem('user_username', user.username || 'Unknown');
        
        await createUserSigner(user.fid);
        
    } catch (error) {
        console.error('❌ Auth setup failed:', error);
        showFarcasterConnectModal();
    }
}

// Enhanced connection modal that actually connects Farcaster account
function showFarcasterConnectModal() {
    const modal = document.createElement('div');
    modal.className = 'connect-modal';
    modal.innerHTML = `
        <div class="connect-modal-content">
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 64px; margin-bottom: 16px;">🔗</div>
                <h3 style="color: #8B5CF6; margin-bottom: 8px;">Connect Your Farcaster Account</h3>
                <p style="color: #666; line-height: 1.5;">Grant Cast Scheduler permission to post on your behalf for automatic scheduling.</p>
            </div>
            
            <div style="background: #f0f9ff; border: 1px solid #0ea5e9; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                <h4 style="color: #0369a1; margin-bottom: 12px;">🎯 What you'll get:</h4>
                <ul style="text-align: left; margin: 0; padding-left: 20px; color: #0369a1; line-height: 1.6;">
                    <li style="margin: 6px 0;">✨ Fully automated posting - no manual intervention needed</li>
                    <li style="margin: 6px 0;">⚡ Posts published exactly at your scheduled times</li>
                    <li style="margin: 6px 0;">🔒 Secure connection via Farcaster protocol</li>
                    <li style="margin: 6px 0;">📱 Works even when you're not online</li>
                </ul>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">
                    <strong>🔐 Safe & Secure:</strong> We only get permission to post casts you schedule. We cannot access your private data or post anything else.
                </p>
            </div>
            
            <div style="text-align: center;">
                <button id="connect-farcaster" style="background: linear-gradient(135deg, #8B5CF6, #EC4899); color: white; border: none; padding: 16px 32px; border-radius: 12px; cursor: pointer; margin-bottom: 12px; font-weight: 600; font-size: 16px; width: 100%;">
                    🚀 Connect Farcaster Account
                </button>
                <button id="continue-manual" style="background: transparent; color: #6c757d; border: 1px solid #6c757d; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 14px;">
                    Continue in Manual Mode
                </button>
            </div>
            
            <div id="connection-status" style="margin-top: 16px; text-align: center; display: none;">
                <p style="color: #8B5CF6; font-weight: 500;">🔄 Connecting to Farcaster...</p>
            </div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.8); display: flex; align-items: center; 
        justify-content: center; z-index: 1000; backdrop-filter: blur(5px);
    `;
    
    modal.querySelector('.connect-modal-content').style.cssText = `
        background: white; padding: 32px; border-radius: 20px; 
        max-width: 520px; margin: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(modal);
    
    // Handle connection button click
    modal.querySelector('#connect-farcaster').onclick = async () => {
        await handleFarcasterConnection(modal);
    };
    
    // Handle manual mode
    modal.querySelector('#continue-manual').onclick = () => {
        modal.remove();
        showStatus('📱 Manual mode enabled - you\'ll get notifications when casts are ready', 'success');
    };
    
    return modal;
}

// Enhanced connection handler that properly signs in the user
async function handleFarcasterConnection(modal) {
    const connectBtn = modal.querySelector('#connect-farcaster');
    const statusDiv = modal.querySelector('#connection-status');
    
    try {
        // Show loading state
        connectBtn.textContent = '🔄 Connecting...';
        connectBtn.disabled = true;
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '<p style="color: #8B5CF6; font-weight: 500;">🔄 Requesting Farcaster sign-in...</p>';
        
        // Step 1: Verify Farcaster SDK is available
        if (!farcasterSDK || !farcasterSDK.actions) {
            throw new Error('Farcaster SDK not available. Please open this app from within Farcaster/Warpcast.');
        }
        
        // Step 2: Generate a random nonce for security
        const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Step 3: CRITICAL - Use signIn to actually authenticate the user
        statusDiv.innerHTML = '<p style="color: #8B5CF6; font-weight: 500;">🔐 Please approve the sign-in request in Farcaster...</p>';
        
        let signInResult;
        let user;
        
        try {
            // Try the proper signIn method first
            if (farcasterSDK.actions.signIn) {
                signInResult = await farcasterSDK.actions.signIn({
                    nonce: nonce,
                    acceptAuthAddress: true // Enable auth address support for better UX
                });
                console.log('✅ Sign-in successful:', signInResult);
            }
            
            // Get user data after successful sign-in
            statusDiv.innerHTML = '<p style="color: #8B5CF6; font-weight: 500;">✅ Sign-in approved! Getting user info...</p>';
            user = await farcasterSDK.actions.getUserData();
            
        } catch (sdkError) {
            console.log('⚠️ signIn method not available, trying alternative auth');
            // Fallback: try to get user data directly
            user = await farcasterSDK.actions.getUserData();
            
            if (!user || !user.fid) {
                throw new Error('Unable to authenticate. Please make sure you are signed into Farcaster and try again.');
            }
        }
        
        if (!user || !user.fid) {
            throw new Error('Unable to get user data after authentication');
        }
        
        console.log('✅ User data retrieved:', user);
        
        // Step 4: Create Neynar signer with proper permissions
        statusDiv.innerHTML = '<p style="color: #8B5CF6; font-weight: 500;">🔄 Setting up automatic posting permissions...</p>';
        
        const signerData = {
            fid: user.fid
        };
        
        // Include sign-in data if available
        if (signInResult && signInResult.message && signInResult.signature) {
            signerData.message = signInResult.message;
            signerData.signature = signInResult.signature;
        }
        
        const response = await fetch('/api/create-signer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signerData)
        });
        
        const result = await response.json();
        
        if (!result.success || !result.signerUuid) {
            throw new Error(result.error || 'Failed to set up automatic posting');
        }
        
        // Step 5: Store connection info
        localStorage.setItem('user_fid', user.fid);
        localStorage.setItem('user_username', user.username || user.displayName || 'Unknown');
        localStorage.setItem('user_signer_uuid', result.signerUuid);
        localStorage.setItem('connection_timestamp', new Date().toISOString());
        
        if (signInResult) {
            localStorage.setItem('sign_in_message', signInResult.message || '');
            localStorage.setItem('sign_in_signature', signInResult.signature || '');
        }
        
        // Step 6: Show success
        statusDiv.innerHTML = '<p style="color: #10b981; font-weight: 500;">🎉 Connection successful! Auto-posting enabled.</p>';
        connectBtn.textContent = '✅ Connected Successfully';
        connectBtn.style.background = '#10b981';
        
        // Step 7: Close modal and show success message
        setTimeout(() => {
            modal.remove();
            showStatus('🎉 Farcaster account connected! Your scheduled casts will now post automatically.', 'success');
            
            // Update UI to show connection status
            updateConnectionStatus();
            loadScheduledPosts();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Connection failed:', error);
        
        // Show error state
        statusDiv.innerHTML = `<p style="color: #ef4444; font-weight: 500;">❌ ${error.message}</p>`;
        connectBtn.textContent = '🔄 Try Again';
        connectBtn.disabled = false;
        connectBtn.style.background = 'linear-gradient(135deg, #8B5CF6, #EC4899)';
        
        // Add retry functionality
        connectBtn.onclick = () => handleFarcasterConnection(modal);
    }
}

// Create and register signer with Neynar API
async function createUserSigner(fid) {
    try {
        showStatus('🔧 Setting up auto-posting with Neynar API... This may take a moment.', 'success');
        
        console.log('📡 Calling Neynar API to create signer for FID:', fid);
        
        const response = await fetch('/api/create-signer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fid: fid })
        });
        
        const result = await response.json();
        console.log('📡 Neynar signer response:', result);
        
        if (result.success && result.signerUuid) {
            localStorage.setItem('user_signer_uuid', result.signerUuid);
            
            if (result.status === 'registered') {
                console.log('✅ Neynar signer registered successfully!');
                showStatus('🎉 Auto-posting enabled! Your scheduled casts will post automatically via Neynar.', 'success');
                updateConnectionStatus();
            } else if (result.status === 'pending_approval') {
                console.log('⚠️ Signer needs approval');
                showStatus('🔧 Auto-posting setup complete, but may need approval for some casts.', 'success');
            }
        } else {
            throw new Error(result.error || 'Failed to create Neynar signer');
        }
    } catch (error) {
        console.error('❌ Failed to create Neynar signer:', error);
        showStatus('❌ Auto-posting setup failed. You\'ll receive manual notifications instead.', 'error');
    }
}

// Add connection status indicator to header
function updateConnectionStatus() {
    const headerActions = document.querySelector('.header-actions');
    const existingStatus = document.querySelector('.connection-status');
    
    if (existingStatus) {
        existingStatus.remove();
    }
    
    const signerUuid = localStorage.getItem('user_signer_uuid');
    const username = localStorage.getItem('user_username');
    
    if (signerUuid && username) {
        const statusElement = document.createElement('div');
        statusElement.className = 'connection-status';
        statusElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 6px 12px; font-size: 12px; color: #059669; font-weight: 600;">
                <span style="color: #10b981;">●</span>
                Connected as @${username}
            </div>
        `;
        headerActions.insertBefore(statusElement, headerActions.firstChild);
    }
}

// Prompt user to add mini app using official SDK action
async function promptAddMiniApp() {
    try {
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.addMiniApp) {
            // Show a beautiful dialog first
            const shouldAdd = await showAddAppDialog();
            
            if (shouldAdd) {
                // Use official addMiniApp action from docs
                await farcasterSDK.actions.addMiniApp();
                console.log('✅ Mini app added to user collection');
                showStatus('📌 Cast Scheduler added to your apps!', 'success');
                
                // Request notification permission
                await requestNotificationPermission();
            }
        }
    } catch (error) {
        if (error.message === 'RejectedByUser') {
            console.log('User rejected adding the mini app');
            showStatus('📱 You can add Cast Scheduler later from the menu', 'success');
        } else {
            console.error('Could not add mini app:', error);
        }
    }
}

// Enhanced add app dialog
function showAddAppDialog() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'add-app-modal';
        modal.innerHTML = `
            <div class="add-app-modal-content">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 64px; margin-bottom: 16px;">📅</div>
                    <h3 style="color: #8B5CF6; margin-bottom: 8px;">Add Cast Scheduler</h3>
                    <p style="color: #666; margin-bottom: 20px;">Never miss the perfect posting moment</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <h4 style="color: #333; margin-bottom: 12px;">✨ Benefits:</h4>
                    <ul style="text-align: left; margin: 0; padding-left: 20px; color: #555;">
                        <li style="margin: 8px 0;">🔔 Push notifications when posts are ready</li>
                        <li style="margin: 8px 0;">⚡ Quick access from your app drawer</li>
                        <li style="margin: 8px 0;">📱 Easy scheduling on the go</li>
                        <li style="margin: 8px 0;">🎯 Optimal timing suggestions</li>
                        <li style="margin: 8px 0;">🤖 Automatic posting via Neynar API</li>
                    </ul>
                </div>
                
                <div style="text-align: center;">
                    <button id="add-yes" style="background: linear-gradient(135deg, #8B5CF6, #EC4899); color: white; border: none; padding: 14px 28px; border-radius: 12px; cursor: pointer; margin-right: 12px; font-weight: 600; font-size: 15px;">
                        🚀 Add to My Apps
                    </button>
                    <button id="add-no" style="background: #6c757d; color: white; border: none; padding: 14px 28px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 15px;">
                        Maybe Later
                    </button>
                </div>
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
            background: rgba(0,0,0,0.7); display: flex; align-items: center; 
            justify-content: center; z-index: 1000; backdrop-filter: blur(5px);
        `;
        
        modal.querySelector('.add-app-modal-content').style.cssText = `
            background: white; padding: 32px; border-radius: 20px; 
            max-width: 420px; margin: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('#add-yes').onclick = () => {
            modal.remove();
            resolve(true);
        };
        
        modal.querySelector('#add-no').onclick = () => {
            modal.remove();
            resolve(false);
        };
    });
}

// Request notification permission with enhanced UI
async function requestNotificationPermission() {
    try {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                showStatus('🔔 Notifications enabled! You\'ll be alerted when posts are ready.', 'success');
                localStorage.setItem('notifications_enabled', 'true');
            }
        }
    } catch (error) {
        console.error('Could not request notification permission:', error);
    }
}

// App setup function
function setupApp() {
    window.appInitialized = true;
    setupEventListeners();
    loadScheduledPosts();
    setMinDateTime();
    startScheduleChecker();
    loadDraft();
    updateConnectionStatus(); // Add connection status to header
}

function setupEventListeners() {
    document.getElementById('schedule-form').addEventListener('submit', handleScheduleSubmit);
    document.getElementById('cast-content').addEventListener('input', updateCharCount);
    updateCharCount();
}

// Enhanced share app functionality using official SDK actions
async function shareApp() {
    const appUrl = window.location.href;
    const shareText = `🚀 Never miss optimal posting times again! 

📅 Cast Scheduler helps you:
• Schedule posts for peak engagement
• Get notified when it's time to post  
• Maximize your Farcaster reach
• Automatic posting with Neynar API

✨ Built as a Farcaster Mini App - add it to your collection!

Try it: ${appUrl}`;

    try {
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.composeCast) {
            // Use official composeCast action from docs
            await farcasterSDK.actions.composeCast({
                text: shareText
            });
            return;
        }
    } catch (error) {
        console.log('SDK sharing not available, using fallback');
    }

    // Enhanced fallback sharing
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Cast Scheduler - Farcaster Mini App',
                text: shareText,
                url: appUrl
            });
            return;
        } catch (err) {
            console.log('Native share failed, using clipboard');
        }
    }

    copyToClipboard(shareText);
    showEnhancedShareModal(shareText);
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        showStatus('📋 Share text copied to clipboard!', 'success');
    } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showStatus('📋 Share text copied to clipboard!', 'success');
    }
}

function showEnhancedShareModal(shareText) {
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
        <div class="share-modal-content">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 12px;">📤</div>
                <h3 style="color: #8B5CF6;">Share Cast Scheduler</h3>
                <p style="color: #666; margin-top: 8px;">Spread the word about better scheduling!</p>
            </div>
            
            <div style="background: #f8f9fa; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <label style="font-size: 14px; font-weight: 600; color: #333; display: block; margin-bottom: 8px;">Share Message:</label>
                <textarea readonly style="width: 100%; height: 140px; padding: 12px; border-radius: 8px; border: 1px solid #ddd; background: white; font-family: inherit; font-size: 14px; line-height: 1.4; resize: vertical;">${shareText}</textarea>
            </div>
            
            <div style="text-align: center;">
                <button onclick="navigator.clipboard.writeText('${shareText.replace(/'/g, "\\'")}').then(() => this.textContent = '✅ Copied!')" 
                        style="background: linear-gradient(135deg, #8B5CF6, #EC4899); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-right: 12px; font-weight: 600;">
                    📋 Copy Text
                </button>
                <button onclick="this.closest('.share-modal').remove()" 
                        style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    Close
                </button>
            </div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.7); display: flex; align-items: center;
        justify-content: center; z-index: 1000; backdrop-filter: blur(5px);
    `;
    
    modal.querySelector('.share-modal-content').style.cssText = `
        background: white; padding: 28px; border-radius: 16px;
        max-width: 480px; margin: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Schedule form handling
function handleScheduleSubmit(e) {
    e.preventDefault();
    
    const content = document.getElementById('cast-content').value.trim();
    const scheduleTime = document.getElementById('schedule-time').value;
    
    if (!content) {
        showStatus('❌ Please enter cast content', 'error');
        return;
    }
    
    if (!scheduleTime) {
        showStatus('❌ Please select a schedule time', 'error');
        return;
    }
    
    const scheduledDate = new Date(scheduleTime);
    const now = new Date();
    
    if (scheduledDate <= now) {
        showStatus('❌ Schedule time must be in the future', 'error');
        return;
    }
    
    const scheduledPost = {
        id: Date.now().toString(),
        content: content,
        scheduleTime: scheduleTime,
        created: new Date().toISOString(),
        status: 'scheduled'
    };
    
    saveScheduledPost(scheduledPost);
    clearForm();
    loadScheduledPosts();
    
    // Check if auto-posting is enabled
    const signerUuid = localStorage.getItem('user_signer_uuid');
    if (signerUuid) {
        showStatus('🎉 Cast scheduled successfully! It will be automatically posted via Neynar API at the scheduled time.', 'success');
    } else {
        showStatus('🎉 Cast scheduled successfully! You\'ll get notified when it\'s time to post.', 'success');
    }
}

// Quick scheduling functions
function setOptimalTime(time) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [hours, minutes] = time.split(':');
    tomorrow.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    const formatted = tomorrow.toISOString().slice(0, 16);
    document.getElementById('schedule-time').value = formatted;
}

// Storage functions
function saveScheduledPost(post) {
    const existingPosts = getScheduledPosts();
    existingPosts.push(post);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingPosts));
}

function getScheduledPosts() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
}

function loadScheduledPosts() {
    const posts = getScheduledPosts()
        .filter(post => post.status === 'scheduled')
        .sort((a, b) => new Date(a.scheduleTime) - new Date(b.scheduleTime));
    
    const listContainer = document.getElementById('scheduled-list');
    const countElement = document.getElementById('posts-count');
    
    countElement.textContent = `${posts.length} scheduled`;
    
    if (posts.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                <h3 style="color: var(--text-secondary); margin-bottom: 8px;">No scheduled posts yet</h3>
                <p>Create your first scheduled cast above!</p>
            </div>
        `;
        return;
    }
    
    // Check if auto-posting is enabled
    const signerUuid = localStorage.getItem('user_signer_uuid');
    const autoPostStatus = signerUuid ? '🤖 Auto-post (Neynar)' : '📱 Manual';
    
    listContainer.innerHTML = posts.map(post => `
        <div class="post-item">
            <div class="post-content">${escapeHtml(post.content)}</div>
            <div class="post-time">📅 ${formatDateTime(post.scheduleTime)} • ${autoPostStatus}</div>
            <button class="delete-btn" onclick="deletePost('${post.id}')">🗑️</button>
        </div>
    `).join('');
}

function deletePost(id) {
    const posts = getScheduledPosts().filter(post => post.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    loadScheduledPosts();
    showStatus('🗑️ Post deleted', 'success');
}

// Draft management
function saveDraft() {
    const content = document.getElementById('cast-content').value.trim();
    const scheduleTime = document.getElementById('schedule-time').value;
    
    if (!content && !scheduleTime) {
        showStatus('❌ Nothing to save as draft', 'error');
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

// Enhanced character count with smart tips
function updateCharCount() {
    const textarea = document.getElementById('cast-content');
    const charCount = document.getElementById('char-count');
    const engagementTip = document.getElementById('engagement-tip');
    const length = textarea.value.length;
    
    charCount.textContent = `${length}/320`;
    
    if (length > 280) {
        charCount.className = 'char-count error';
        engagementTip.textContent = '⚠️ Consider shortening your message';
    } else if (length > 250) {
        charCount.className = 'char-count warning';
        engagementTip.textContent = '📏 Getting close to the limit';
    } else if (length > 100) {
        charCount.className = 'char-count';
        engagementTip.textContent = '✨ Great length for engagement!';
    } else if (length > 50) {
        charCount.className = 'char-count';
        engagementTip.textContent = '💡 Add emojis and hashtags for better reach';
    } else {
        charCount.className = 'char-count';
        engagementTip.textContent = '💡 Add emojis and hashtags for better engagement';
    }
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
        weekday: 'short',
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
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}

// Enhanced schedule checker with auto-publishing via Neynar
function startScheduleChecker() {
    setInterval(checkScheduledPosts, 60000); // Check every minute
}

function checkScheduledPosts() {
    const posts = getScheduledPosts();
    const now = new Date();
    
    posts.forEach(post => {
        if (post.status === 'scheduled') {
            const scheduleTime = new Date(post.scheduleTime);
            if (scheduleTime <= now) {
                // Try auto-publishing first, then fallback to notification
                publishPost(post);
            }
        }
    });
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    loadScheduledPosts();
}

// Enhanced publish post function with Neynar API integration
async function publishPost(post) {
    try {
        console.log('🚀 Attempting to auto-publish via Neynar API:', post.content.substring(0, 50) + '...');
        
        // Get user's signer UUID (stored during auth)
        const signerUuid = localStorage.getItem('user_signer_uuid');
        const userFid = localStorage.getItem('user_fid');
        
        console.log('🔍 Debug - Signer UUID:', signerUuid ? 'Found' : 'Missing');
        console.log('🔍 Debug - User FID:', userFid || 'Missing');
        
        if (signerUuid) {
            console.log('📡 Calling Neynar auto-publish API...');
            
            // Try auto-publishing with Neynar API
            const response = await fetch('/api/publish-cast', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: post.content,
                    signerUuid: signerUuid
                })
            });

            const result = await response.json();
            console.log('📡 Neynar API Response:', result);

            if (result.success) {
                // Update post status to published
                const posts = getScheduledPosts();
                const updatedPosts = posts.map(p => 
                    p.id === post.id 
                        ? { 
                            ...p, 
                            status: 'published', 
                            publishedAt: new Date().toISOString(),
                            castHash: result.castHash,
                            castUrl: result.castUrl,
                            publishMethod: 'neynar_api'
                        }
                        : p
                );
                
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
                loadScheduledPosts();
                
                // Show success notification
                showStatus(`🎉 Cast published automatically via Neynar API! Check your Farcaster feed.`, 'success');
                
                // Send browser notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('✅ Cast Published!', {
                        body: `"${post.content.substring(0, 50)}..." has been posted to Farcaster via Neynar`,
                        icon: '/icon.png'
                    });
                }
                
                console.log('✅ Auto-publishing via Neynar successful!');
                return; // Exit early on success
            } else {
                console.error('❌ Neynar API returned error:', result.error);
            }
        } else {
            console.log('⚠️ No signer UUID found - auto-posting not set up');
        }
        
        // Fallback to manual notification if auto-publish fails or no signer
        console.log('🔄 Falling back to manual notification...');
        throw new Error('Auto-publish via Neynar not available');
        
    } catch (error) {
        console.error('❌ Failed to auto-publish via Neynar:', error);
        
        // Fallback to existing manual notification system
        showPostReadyNotification(post);
        showStatus('⚠️ Auto-publish failed. Please post manually when ready.', 'error');
    }
}

function showPostReadyNotification(post) {
    showStatus('🔔 A scheduled post is ready to publish!', 'success');
    
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⏰ Cast Scheduler', {
            body: `Your post is ready: "${post.content.substring(0, 50)}..."`,
            icon: '/icon.png',
            requireInteraction: true
        });
    }
    
    // Show enhanced ready modal
    showPostReadyModal(post);
}

function showPostReadyModal(post) {
    const modal = document.createElement('div');
    modal.className = 'post-ready-modal';
    modal.innerHTML = `
        <div class="post-ready-modal-content">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 56px; margin-bottom: 12px;">⏰</div>
                <h3 style="color: #8B5CF6; margin-bottom: 8px;">Time to Post!</h3>
                <p style="color: #666;">Your scheduled cast is ready to publish</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 16px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #8B5CF6;">
                <div style="font-style: italic; color: #333; line-height: 1.4;">"${post.content}"</div>
            </div>
            
            <div style="text-align: center; margin-top: 24px;">
                <button id="post-now" style="background: linear-gradient(135deg, #8B5CF6, #EC4899); color: white; border: none; padding: 14px 28px; border-radius: 12px; cursor: pointer; margin-right: 12px; font-weight: 600; font-size: 15px;">
                    🚀 Post Now
                </button>
                <button id="remind-later" style="background: #6c757d; color: white; border: none; padding: 14px 28px; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 15px;">
                    ⏰ Remind Me in 5 Min
                </button>
            </div>
            
            <div style="text-align: center; margin-top: 12px;">
                <button id="dismiss" style="background: transparent; border: none; color: #6c757d; padding: 8px 16px; cursor: pointer; font-size: 14px;">
                    Dismiss
                </button>
            </div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
        background: rgba(0,0,0,0.8); display: flex; align-items: center; 
        justify-content: center; z-index: 1000; backdrop-filter: blur(5px);
    `;
    
    modal.querySelector('.post-ready-modal-content').style.cssText = `
        background: white; padding: 32px; border-radius: 16px; 
        max-width: 450px; margin: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#post-now').onclick = () => {
        modal.remove();
        // Try to open Warpcast composer
        if (farcasterSDK && farcasterSDK.actions && farcasterSDK.actions.composeCast) {
            farcasterSDK.actions.composeCast({ text: post.content });
        } else {
            // Fallback to Warpcast URL
            window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(post.content)}`, '_blank');
        }
        // Mark as posted
        const posts = getScheduledPosts();
        const updatedPosts = posts.map(p => 
            p.id === post.id ? { ...p, status: 'posted', postedAt: new Date().toISOString(), publishMethod: 'manual' } : p
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
        loadScheduledPosts();
    };
    
    modal.querySelector('#remind-later').onclick = () => {
        modal.remove();
        // Reschedule for 5 minutes later
        const newTime = new Date(Date.now() + 5 * 60 * 1000);
        const posts = getScheduledPosts();
        const updatedPosts = posts.map(p => 
            p.id === post.id ? { ...p, scheduleTime: newTime.toISOString(), status: 'scheduled' } : p
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
        loadScheduledPosts();
        showStatus('⏰ Reminder set for 5 minutes from now', 'success');
    };
    
    modal.querySelector('#dismiss').onclick = () => {
        modal.remove();
    };
    
    // Auto-dismiss after 30 seconds
    setTimeout(() => {
        if (document.body.contains(modal)) {
            modal.remove();
        }
    }, 30000);
}

// Modal functions
function showOptimalTimes() {
    document.getElementById('optimal-times-modal').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function toggleNotifications() {
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            showStatus('🔔 Notifications are already enabled!', 'success');
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showStatus('🔔 Notifications enabled!', 'success');
                } else {
                    showStatus('🔕 Notifications denied', 'error');
                }
            });
        } else {
            showStatus('🔕 Notifications are blocked. Enable in browser settings.', 'error');
        }
    } else {
        showStatus('❌ Notifications not supported in this browser', 'error');
    }
}

// Enhanced initialization with multiple fallbacks
document.addEventListener('DOMContentLoaded', function() {
    // Immediate ready() call as backup
    if (window.farcasterSDK && window.farcasterSDK.actions && window.farcasterSDK.actions.ready) {
        window.farcasterSDK.actions.ready().catch(console.error);
    }
    
    // Fallback initialization if SDK doesn't load
    setTimeout(() => {
        if (!window.appInitialized) {
            console.log('ℹ️ Fallback initialization - SDK not available');
            setupApp();
        }
    }, 3000);
});

// CSS Animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
`;
document.head.appendChild(style);
