import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { text, signerUuid } = req.body;

        if (!text || !signerUuid) {
            return res.status(400).json({ 
                error: 'Missing required fields: text and signerUuid' 
            });
        }

        console.log('🚀 Publishing cast:', text.substring(0, 50) + '...');

        // Publish the cast using Neynar API v3+ syntax
        const castResponse = await client.publishCast(signerUuid, text);

        console.log('✅ Cast published successfully:', castResponse.hash);

        res.status(200).json({
            success: true,
            message: 'Cast published successfully',
            castHash: castResponse.hash,
            castUrl: `https://warpcast.com/~/cast/${castResponse.hash}`
        });

    } catch (error) {
        console.error('❌ Failed to publish cast:', error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to publish cast',
            details: error.message
        });
    }
}
