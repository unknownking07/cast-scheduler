// Farcaster SDK integration
let sdk;

// Initialize the Farcaster Mini App
document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Initialize Farcaster SDK
    sdk = new window.FarcasterSDK();
    
    // Wait for SDK to be ready
    await sdk.ready();
    
    // Call ready to dismiss splash screen
    sdk.actions.ready();
    
    // Set up the rest of the app
    setupApp();
    
    console.log('✅ Farcaster Mini App initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Farcaster SDK:', error);
    // Still set up the app even if SDK fails
    setupApp();
  }
});

// App setup function
function setupApp() {
  setupEventListeners();
  loadScheduledPosts();
  setMinDateTime();
  startScheduleChecker();
  loadDraft();
  
  // Try to get user context from Farcaster
  getUserContext();
}

// Get user context from Farcaster
async function getUserContext() {
  try {
    if (sdk && sdk.context) {
      const context = await sdk.context.getContext();
      
      if (context.user) {
        console.log('👤 Farcaster user:', context.user.username);
        
        // Optionally display user info
        updateUIWithUserInfo(context.user);
      }
    }
  } catch (error) {
    console.log('ℹ️ Running in standalone mode (not in Farcaster client)');
  }
}

// Update UI with user information
function updateUIWithUserInfo(user) {
  const header = document.querySelector('.app-header p');
  if (header && user.username) {
    header.textContent = `Hello @${user.username}! Schedule your casts for optimal engagement times`;
  }
}

// Local storage keys
const STORAGE_KEY = 'scheduled_casts';
const DRAFT_KEY = 'cast_draft';

function setupEventListeners() {
  document.getElementById('schedule-form').addEventListener('submit', handleScheduleSubmit);
  document.getElementById('cast-content').addEventListener('input', updateCharCount);
  updateCharCount();
}

// Enhanced share app functionality using Farcaster SDK
async function shareApp() {
  const appUrl = window.location.href;
  const shareText = `🚀 Check out this amazing Cast Scheduler for Farcaster! 

📅 Schedule your casts for optimal engagement
⏰ Never miss posting at peak times
✨ Built as a Farcaster Mini App

Perfect for content creators who want to maximize their reach!`;

  try {
    // Try to use Farcaster's native sharing first
    if (sdk && sdk.actions && sdk.actions.openUrl) {
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText + '\n\n' + appUrl)}`;
      await sdk.actions.openUrl(warpcastUrl);
      return;
    }
  } catch (error) {
    console.log('Native sharing not available, falling back to clipboard');
  }

  // Fallback to previous sharing method
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Cast Scheduler - Farcaster Mini App',
        text: shareText,
        url: appUrl
      });
    } catch (err) {
      console.log('Native share failed, copying to clipboard');
      copyToClipboard(shareText + '\n\n' + appUrl);
    }
  } else {
    copyToClipboard(shareText + '\n\n' + appUrl);
    showShareModal(shareText + '\n\n' + appUrl);
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    showStatus('Share text copied to clipboard!', 'success');
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showStatus('Share text copied to clipboard!', 'success');
  }
}

function showShareModal(shareText) {
  const modal = document.createElement('div');
  modal.className = 'share-modal';
  modal.innerHTML = `
    <div class="share-modal-content">
      <h3>📢 Share Cast Scheduler</h3>
      <p>Copy this message to share the app:</p>
      <textarea readonly style="width: 100%; height: 120px; margin: 12px 0; padding: 12px; border-radius: 8px; border: 1px solid #ddd;">${shareText}</textarea>
      <div style="text-align: center;">
        <button onclick="this.closest('.share-modal').remove()" style="background: #8a63d2; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Close</button>
      </div>
    </div>
  `;
  
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
    background: rgba(0,0,0,0.5); display: flex; align-items: center; 
    justify-content: center; z-index: 1000;
  `;
  
  modal.querySelector('.share-modal-content').style.cssText = `
    background: white; padding: 24px; border-radius: 12px; 
    max-width: 400px; margin: 20px;
  `;
  
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Enhanced publish post function using Farcaster SDK
async function publishPost(post) {
  try {
    let published = false;
    
    // Try to use Farcaster SDK for posting
    if (sdk && sdk.actions && sdk.actions.openUrl) {
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(post.content)}`;
      await sdk.actions.openUrl(warpcastUrl);
      published = true;
    }
    
    if (published) {
      // Mark as published
      const posts = getScheduledPosts();
      const updatedPosts = posts.map(p => 
        p.id === post.id 
          ? { ...p, status: 'published', publishedAt: new Date().toISOString() }
          : p
      );
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
      loadScheduledPosts();
      showStatus(`✅ Cast ready to publish: "${post.content.substring(0, 30)}..."`, 'success');
    } else {
      throw new Error('No publishing method available');
    }
  } catch (error) {
    console.error('Failed to publish post:', error);
    
    // Mark as failed but provide manual option
    const posts = getScheduledPosts();
    const updatedPosts = posts.map(p => 
      p.id === post.id 
        ? { ...p, status: 'ready', error: error.message }
        : p
    );
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPosts));
    showStatus(`⏰ Time to post: "${post.content.substring(0, 30)}..." - Click to open composer`, 'success');
  }
}

// Rest of your existing functions remain the same...
// [Include all the other functions from your previous app.js here]

// Schedule form handling
function handleScheduleSubmit(e) {
  e.preventDefault();
  
  const content = document.getElementById('cast-content').value.trim();
  const scheduleTime = document.getElementById('schedule-time').value;
  
  if (!content) {
    showStatus('Please enter cast content', 'error');
    return;
  }
  
  if (!scheduleTime) {
    showStatus('Please select a schedule time', 'error');
    return;
  }
  
  const scheduledDate = new Date(scheduleTime);
  const now = new Date();
  
  if (scheduledDate <= now) {
    showStatus('Schedule time must be in the future', 'error');
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
  showStatus('Cast scheduled successfully! 🎉', 'success');
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
  
  if (posts.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; color: #666; padding: 20px;">
        <p>📝 No scheduled posts yet</p>
        <p style="font-size: 14px; margin-top: 8px;">Create your first scheduled cast above!</p>
      </div>
    `;
    return;
  }
  
  listContainer.innerHTML = posts.map(post => `
    <div class="post-item">
      <button class="delete-btn" onclick="deleteScheduledPost('${post.id}')">❌</button>
      <div class="post-content">${escapeHtml(post.content)}</div>
      <div class="post-time">⏰ ${formatDateTime(post.scheduleTime)}</div>
    </div>
  `).join('');
}

function deleteScheduledPost(postId) {
  const posts = getScheduledPosts().filter(post => post.id !== postId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  loadScheduledPosts();
  showStatus('Scheduled post deleted', 'success');
}

// Draft functionality
function saveDraft() {
  const content = document.getElementById('cast-content').value.trim();
  if (!content) {
    showStatus('Nothing to save as draft', 'error');
    return;
  }
  
  localStorage.setItem(DRAFT_KEY, content);
  showStatus('Draft saved! 💾', 'success');
}

function loadDraft() {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    document.getElementById('cast-content').value = draft;
    updateCharCount();
  }
}

// Utility functions
function clearForm() {
  document.getElementById('cast-content').value = '';
  document.getElementById('schedule-time').value = '';
  localStorage.removeItem(DRAFT_KEY);
  updateCharCount();
}

function updateCharCount() {
  const content = document.getElementById('cast-content').value;
  const count = content.length;
  document.getElementById('char-count').textContent = count;
  
  const charCountElement = document.querySelector('.char-count');
  if (count > 320) {
    charCountElement.style.color = '#dc3545';
  } else if (count > 280) {
    charCountElement.style.color = '#ffc107';
  } else {
    charCountElement.style.color = '#666';
  }
}

function setMinDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const formatted = now.toISOString().slice(0, 16);
  document.getElementById('schedule-time').min = formatted;
}

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 4000);
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

// Background scheduler
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
