import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const client = new NeynarAPIClient(process.env.NEYNAR_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { fid, username, signature, message, nonce } = req.body;

        if (!fid) {
            return res.status(400).json({ error: 'FID is required' });
        }

        console.log('🔧 Creating signer for authenticated user FID:', fid);

        // Create a signer
        const signer = await client.createSigner();
        
        console.log('✅ Signer created:', signer.signer_uuid);

        // Register the signer
        try {
            const registerPayload = {
                signerUuid: signer.signer_uuid,
                fid: parseInt(fid),
                deadline: Math.floor(Date.now() / 1000) + 86400 // 24 hours
            };
            
            // Include sign-in authentication if provided
            if (signature && message) {
                registerPayload.signature = signature;
                registerPayload.signedMessage = message;
                console.log('📝 Including sign-in authentication data');
            }
            
            const registerResponse = await client.registerSignedKeyForDeveloperManagedSigner(registerPayload);
            
            console.log('✅ Signer registered successfully');
            
            res.status(200).json({
                success: true,
                signerUuid: signer.signer_uuid,
                publicKey: signer.public_key,
                status: 'registered',
                message: 'Auto-posting enabled successfully'
            });

        } catch (registerError) {
            console.log('⚠️ Auto-registration failed:', registerError.message);
            
            res.status(200).json({
                success: true,
                signerUuid: signer.signer_uuid,
                publicKey: signer.public_key,
                status: 'pending_approval',
                message: 'Signer created, may need manual approval'
            });
        }

    } catch (error) {
        console.error('❌ Failed to create signer:', error);
        res.status(500).json({ 
            error: 'Failed to create signer',
            details: error.message 
        });
    }
}
