// api/webhook.js - Vercel serverless function
import { parseWebhookEvent, verifyAppKeyWithNeynar } from "@farcaster/frame-node";

// Simple in-memory storage (use Vercel KV or external DB in production)
const notificationTokens = new Map();

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    // Parse and verify the webhook event
    const data = await parseWebhookEvent(req.body, verifyAppKeyWithNeynar);
    
    const { fid, event } = data;
    console.log(`Processing event: ${event.event} for user ${fid}`);
    
    switch (event.event) {
      case 'frame_added':
        console.log(`✅ User ${fid} added the app`);
        if (event.notificationDetails) {
          notificationTokens.set(fid, {
            token: event.notificationDetails.token,
            url: event.notificationDetails.url,
            enabled: true,
            addedAt: new Date().toISOString()
          });
          console.log(`📱 Stored notification token for user ${fid}`);
        }
        break;
        
      case 'notifications_enabled':
        console.log(`🔔 User ${fid} enabled notifications`);
        notificationTokens.set(fid, {
          token: event.notificationDetails.token,
          url: event.notificationDetails.url,
          enabled: true,
          enabledAt: new Date().toISOString()
        });
        break;
        
      case 'notifications_disabled':
        console.log(`🔕 User ${fid} disabled notifications`);
        if (notificationTokens.has(fid)) {
          const existing = notificationTokens.get(fid);
          notificationTokens.set(fid, { ...existing, enabled: false });
        }
        break;
        
      case 'frame_removed':
        console.log(`❌ User ${fid} removed the app`);
        notificationTokens.delete(fid);
        break;
        
      default:
        console.log(`Unknown event: ${event.event}`);
    }
    
    res.status(200).json({ success: true, message: `Processed ${event.event}` });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    
    // Return appropriate error status
    if (error.name?.includes('VerifyJsonFarcasterSignature')) {
      return res.status(400).json({ error: 'Invalid signature or event data' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Export function to send notifications (used by other API routes)
export async function sendNotificationToUser(fid, notificationData) {
  const userToken = notificationTokens.get(fid);
  
  if (!userToken || !userToken.enabled) {
    console.log(`⚠️ No valid token for user ${fid}`);
    return { success: false, reason: 'No valid token' };
  }
  
  try {
    console.log(`📤 Sending notification to user ${fid}:`, notificationData);
    
    const response = await fetch(userToken.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notificationId: notificationData.notificationId,
        title: notificationData.title,
        body: notificationData.body,
        targetUrl: notificationData.targetUrl,
        tokens: [userToken.token]
      })
    });
    
    const result = await response.json();
    console.log(`📬 Notification response:`, result);
    
    // Handle invalid tokens
    if (result.invalidTokens && result.invalidTokens.includes(userToken.token)) {
      console.log(`🗑️ Removing invalid token for user ${fid}`);
      notificationTokens.delete(fid);
      return { success: false, reason: 'Invalid token' };
    }
    
    // Handle rate limited tokens
    if (result.rateLimitedTokens && result.rateLimitedTokens.includes(userToken.token)) {
      console.log(`⏳ Rate limited for user ${fid}`);
      return { success: false, reason: 'Rate limited' };
    }
    
    return { 
      success: response.ok, 
      result,
      reason: response.ok ? 'Sent successfully' : 'Request failed'
    };
    
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    return { success: false, reason: error.message };
  }
}