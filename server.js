require('dotenv').config();
const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const app = express();

// Serve static files
app.use(express.static('.'));
app.use(express.json());

// LiveKit server configuration
const livekitHost = process.env.LIVEKIT_HOST || 'wss://play-um2ffagk.livekit.cloud';
const apiKey = process.env.LIVEKIT_API_KEY || 'your_api_key';
const apiSecret = process.env.LIVEKIT_API_SECRET || 'your_api_secret';

if (!apiKey || !apiSecret) {
    console.error('Missing LiveKit API credentials. Please set LIVEKIT_API_KEY and LIVEKIT_API_SECRET environment variables.');
    process.exit(1);
}

// API endpoint to create access token
app.post('/get-token', async (req, res) => {
    const { roomName, participantName } = req.body;
    
    if (!roomName || !participantName) {
        return res.status(400).json({ error: 'Missing room name or participant name' });
    }

    try {
        // Create access token with the API key and secret
        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantName,
            ttl: 3600 * 24, // 24 hours in seconds
        });

        // Add grant for the room
        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        // Generate token
        const token = await Promise.resolve(at.toJwt());
        
        // Log for debugging
        console.log('Room Name:', roomName);
        console.log('Participant Name:', participantName);
        console.log('Generated Token:', token);
        
        // Send response
        res.json({
            token: token,
            url: livekitHost
        });
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({ error: 'Failed to generate token: ' + error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 