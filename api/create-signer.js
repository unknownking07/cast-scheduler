import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { fid } = req.body;

        // Create a signer for the user (updated syntax for v3+)
        const signer = await client.createSigner();
        
        console.log('✅ Signer created for FID:', fid);
        
        res.status(200).json({
            signerUuid: signer.signer_uuid,
            publicKey: signer.public_key,
            status: signer.status
        });

    } catch (error) {
        console.error('❌ Failed to create signer:', error);
        res.status(500).json({ 
            error: 'Failed to create signer',
            details: error.message 
        });
    }
}
