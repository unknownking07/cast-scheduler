// api/send-notification.js - Vercel serverless function
import { sendNotificationToUser } from './webhook.js';

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
    const { fid, notificationId, title, body, targetUrl } = req.body;

    // Validate required fields
    if (!fid || !notificationId || !title || !body || !targetUrl) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['fid', 'notificationId', 'title', 'body', 'targetUrl']
      });
    }

    // Validate field lengths per Farcaster requirements
    const validationErrors = [];
    
    if (notificationId.length > 128) {
      validationErrors.push('notificationId too long (max 128 characters)');
    }
    
    if (title.length > 32) {
      validationErrors.push('title too long (max 32 characters)');
    }
    
    if (body.length > 128) {
      validationErrors.push('body too long (max 128 characters)');
    }
    
    if (targetUrl.length > 1024) {
      validationErrors.push('targetUrl too long (max 1024 characters)');
    }
    
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation errors', 
        details: validationErrors 
      });
    }

    console.log(`📤 API: Sending notification to user ${fid}`);

    // Send the notification
    const result = await sendNotificationToUser(fid, {
      notificationId,
      title,
      body,
      targetUrl
    });

    if (result.success) {
      res.status(200).json({ 
        success: true, 
        message: 'Notification sent successfully',
        details: result.result
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Failed to send notification',
        reason: result.reason
      });
    }

  } catch (error) {
    console.error('❌ Send notification API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}