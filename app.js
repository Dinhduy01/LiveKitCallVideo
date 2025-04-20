// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const hangupButton = document.getElementById('hangupButton');
const muteButton = document.getElementById('muteButton');
const videoButton = document.getElementById('videoButton');
const roomInput = document.getElementById('roomId');
const joinButton = document.getElementById('joinButton');
const videoContainer = document.querySelector('.video-container');
const controls = document.querySelector('.controls');
const participantsArea = document.getElementById('participants-area');
const screenShareButton = document.getElementById('screenShareButton');
const leaveButton = document.getElementById('leaveButton');
const participantNameInput = document.getElementById('participantName');

// Variables
let room;
let localStream;
let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let currentRoom = null;

// Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Constants
const VIDEO_ELEMENT_CLASS = 'participant-video';
const VIDEO_CONTAINER_CLASS = 'video-container';
const VIDEO_PLACEHOLDER_CLASS = 'video-placeholder';
const PARTICIPANT_DIV_CLASS = 'participant';

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    joinButton.addEventListener('click', joinRoom);
    muteButton.addEventListener('click', toggleMute);
    videoButton.addEventListener('click', toggleVideo);
    screenShareButton.addEventListener('click', toggleScreenShare);
    leaveButton.addEventListener('click', leaveRoom);
});

// Functions
async function getToken(roomName, participantName) {
    try {
        console.log('Requesting token for:', participantName, 'in room:', roomName);
        const response = await fetch('/get-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ roomName, participantName }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Server response:', data);

        if (!data.token || typeof data.token !== 'string') {
            console.error('Invalid token format:', data);
            throw new Error('Invalid token format received from server');
        }

        if (!data.url) {
            console.error('Missing LiveKit URL:', data);
            throw new Error('Missing LiveKit URL in server response');
        }

        return {
            token: data.token,
            url: data.url
        };
    } catch (error) {
        console.error('Token request failed:', error);
        throw error;
    }
}

function createParticipantElement(participant) {
    const participantDiv = document.createElement('div');
    participantDiv.id = `participant-${participant.identity}`;
    participantDiv.className = 'participant';
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    
    const videoElement = document.createElement('video');
    videoElement.id = `video-${participant.identity}`;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.className = 'participant-video';
    
    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.textContent = participant.identity.charAt(0).toUpperCase();
    
    videoContainer.appendChild(videoElement);
    videoContainer.appendChild(placeholder);
    
    const nameElement = document.createElement('div');
    nameElement.className = 'participant-name';
    nameElement.textContent = participant.identity;
    
    participantDiv.appendChild(videoContainer);
    participantDiv.appendChild(nameElement);
    
    return participantDiv;
}

// Helper functions
function createVideoElement(participantId) {
    const videoElement = document.createElement('video');
    videoElement.id = `video-${participantId}`;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.className = VIDEO_ELEMENT_CLASS;
    return videoElement;
}

function createAudioElement(participantId) {
    const audioElement = document.createElement('audio');
    audioElement.id = `audio-${participantId}`;
    audioElement.autoplay = true;
    audioElement.style.display = 'none';
    return audioElement;
}

function getParticipantElements(participantId) {
    const participantDiv = document.getElementById(`participant-${participantId}`);
    if (!participantDiv) return null;

    const videoContainer = participantDiv.querySelector(`.${VIDEO_CONTAINER_CLASS}`);
    const placeholder = videoContainer?.querySelector(`.${VIDEO_PLACEHOLDER_CLASS}`);
    const videoElement = document.getElementById(`video-${participantId}`);

    return { participantDiv, videoContainer, placeholder, videoElement };
}

async function handleTrackSubscribed(track, publication, participant) {
    console.log('Track subscribed:', track.kind, 'from', participant.identity);
    
    // Ensure participant element exists
    let participantDiv = document.getElementById(`participant-${participant.identity}`);
    if (!participantDiv) {
        console.log('Creating missing participant element for:', participant.identity);
        participantDiv = createParticipantElement(participant);
        participantsArea.appendChild(participantDiv);
    }
    
    if (track.kind === 'video') {
        const elements = getParticipantElements(participant.identity);
        if (!elements) {
            console.error(`Failed to get participant elements for ${participant.identity} even after creation`);
            return;
        }

        let { videoElement, placeholder } = elements;

        // Create video element if it doesn't exist
        if (!videoElement) {
            videoElement = createVideoElement(participant.identity);
            elements.videoContainer.appendChild(videoElement);
            console.log('Created video element for participant:', participant.identity);
        }

        try {
            // Attach the new track
            track.attach(videoElement);
            console.log('Video track attached for:', participant.identity);
            
            // Hide placeholder
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        } catch (error) {
            console.error('Error handling video track:', error);
            if (placeholder) {
                placeholder.style.display = 'block';
            }
        }
    } else if (track.kind === 'audio') {
        await handleAudioTrack(track, participant);
    }
}

async function handleAudioTrack(track, participant) {
    const audioElement = createAudioElement(participant.identity);
    document.body.appendChild(audioElement);
    
    try {
        track.attach(audioElement);
        console.log('Audio track attached');
    } catch (error) {
        console.error('Error handling audio track:', error);
    }
}

async function handleRoomConnected() {
    console.log('Room connected:', room.name);
    
    // Create elements for all existing participants
    if (room && room.participants) {
        for (const [_, participant] of room.participants) {
            if (participant !== room.localParticipant) {
                let participantDiv = document.getElementById(`participant-${participant.identity}`);
                if (!participantDiv) {
                    participantDiv = createParticipantElement(participant);
                    participantsArea.appendChild(participantDiv);
                    console.log('Created element for existing participant:', participant.identity);
                }

                // Subscribe to existing tracks
                participant.getTracks().forEach(track => {
                    if (track.track) {
                        handleTrackSubscribed(track.track, track, participant);
                    }
                });
            }
        }
    }
}

async function handleParticipantConnected(participant) {
    console.log('Participant connected:', participant.identity);
    
    // First, create the participant element if it doesn't exist
    let participantDiv = document.getElementById(`participant-${participant.identity}`);
    if (!participantDiv) {
        participantDiv = createParticipantElement(participant);
        participantsArea.appendChild(participantDiv);
        console.log('Created element for new participant:', participant.identity);
    }

    // Subscribe to participant's existing tracks
    participant.getTracks().forEach(track => {
        if (track.track) {
            handleTrackSubscribed(track.track, track, participant);
        }
    });

    showSuccess(`${participant.identity} joined the room`);
}

// Add event listeners for track publication
room.on('trackPublished', (publication, participant) => {
    console.log('Track published:', publication.kind, 'from', participant.identity);
    if (publication.track) {
        handleTrackSubscribed(publication.track, publication, participant);
    }
});

// Add event listeners for track subscription
room.on('trackSubscribed', (track, publication, participant) => {
    console.log('Track subscribed event:', track.kind, 'from', participant.identity);
    handleTrackSubscribed(track, publication, participant);
});

// Add event listeners for participant connection
room.on('participantConnected', (participant) => {
    console.log('Participant connected event:', participant.identity);
    handleParticipantConnected(participant);
});

// Add event listeners for participant disconnection
room.on('participantDisconnected', (participant) => {
    console.log('Participant disconnected:', participant.identity);
    const participantDiv = document.getElementById(`participant-${participant.identity}`);
    if (participantDiv) {
        participantDiv.remove();
    }
    showWarning(`${participant.identity} left the room`);
});

async function joinRoom() {
    const roomName = roomInput.value.trim();
    const participantName = participantNameInput.value.trim();

    if (!roomName || !participantName) {
        showError('Please enter both room name and your name');
        return;
    }

    try {
        // Get token from server
        const { token, url } = await getToken(roomName, participantName);
        console.log('Connecting to room with token:', token);
        
        // Create room
        room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: {
                resolution: LivekitClient.VideoPresets.h720.resolution,
            },
        });

        // Set up event listeners
        room
            .on('participantConnected', handleParticipantConnected)
            .on('participantDisconnected', handleParticipantDisconnected)
            .on('trackSubscribed', handleTrackSubscribed)
            .on('trackUnsubscribed', handleTrackUnsubscribed)
            .on('trackPublished', handleTrackPublished)
            .on('localTrackPublished', handleLocalTrackPublished)
            .on('connected', handleRoomConnected);

        // Connect to room
        await room.connect(url, token);
        console.log('Connected to room:', room.name);
        
        // Create local participant element first
        const localParticipantDiv = createParticipantElement(room.localParticipant);
        localParticipantDiv.classList.add('local-participant');
        participantsArea.appendChild(localParticipantDiv);
        
        // Wait a bit to ensure DOM is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check device availability first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        const hasMicrophone = devices.some(device => device.kind === 'audioinput');

        try {
            if (hasCamera && hasMicrophone) {
                // Try to enable both camera and microphone
                await room.localParticipant.enableCameraAndMicrophone();
                isVideoOff = false;
                videoButton.textContent = 'Stop Video';
                console.log('Camera and microphone enabled');
            } else if (hasMicrophone) {
                // Only enable microphone if available
                await room.localParticipant.setMicrophoneEnabled(true);
                isVideoOff = true;
                videoButton.textContent = 'Start Video';
                videoButton.disabled = true; // Disable video button if no camera
                showWarning('No camera detected. Joining with audio only.');
                console.log('Microphone enabled, no camera available');
            } else {
                // No audio devices available
                isVideoOff = true;
                isMuted = true;
                videoButton.textContent = 'Start Video';
                muteButton.textContent = 'Unmute';
                videoButton.disabled = true;
                muteButton.disabled = true;
                showWarning('No audio or video devices detected. You can only view the meeting.');
                console.log('No media devices available');
            }
        } catch (error) {
            console.warn('Error accessing media devices:', error);
            
            // Try fallback to audio only if camera fails
            if (hasMicrophone) {
                try {
                    await room.localParticipant.setMicrophoneEnabled(true);
                    isVideoOff = true;
                    videoButton.textContent = 'Start Video';
                    showWarning('Could not access camera. Joining with audio only.');
                    console.log('Fallback to audio only successful');
                } catch (micError) {
                    console.error('Could not enable microphone:', micError);
                    isVideoOff = true;
                    isMuted = true;
                    videoButton.disabled = true;
                    muteButton.disabled = true;
                    showError('Could not access any media devices. You can only view the meeting.');
                }
            } else {
                isVideoOff = true;
                isMuted = true;
                videoButton.disabled = true;
                muteButton.disabled = true;
                showError('No media devices available. You can only view the meeting.');
            }
        }

        // Update UI
        document.querySelector('.room-input').style.display = 'none';
        document.querySelector('.video-container').style.display = 'flex';
        document.querySelector('.controls').style.display = 'flex';
        
        // Enable available control buttons
        if (!videoButton.disabled) videoButton.disabled = false;
        if (!muteButton.disabled) muteButton.disabled = false;
        screenShareButton.disabled = false;
        leaveButton.disabled = false;

        showSuccess('Successfully joined the room');

    } catch (error) {
        console.error('Error joining room:', error);
        showError('Failed to join room: ' + error.message);
    }
}

async function startCall() {
    try {
        // Get local media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Display local video
        localVideo.srcObject = localStream;
        
        // Create peer connection
        peerConnection = new RTCPeerConnection(configuration);
        
        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle remote stream
        peerConnection.ontrack = event => {
            remoteVideo.srcObject = event.streams[0];
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    roomId: currentRoom,
                    candidate: event.candidate
                });
            }
        };
        
        // Create and set local description
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send offer to other peer
        socket.emit('offer', {
            roomId: currentRoom,
            offer: offer
        });
        
        // Update UI
        startButton.disabled = true;
        hangupButton.disabled = false;
        
    } catch (error) {
        console.error('Error starting call:', error);
    }
}

async function handleOffer(data) {
    try {
        if (!peerConnection) {
            // Get local media stream
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            // Display local video
            localVideo.srcObject = localStream;
            
            // Create peer connection
            peerConnection = new RTCPeerConnection(configuration);
            
            // Add local stream to peer connection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            // Handle remote stream
            peerConnection.ontrack = event => {
                remoteVideo.srcObject = event.streams[0];
            };

            // Handle ICE candidates
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        roomId: currentRoom,
                        candidate: event.candidate
                    });
                }
            };
        }

        // Set remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            roomId: currentRoom,
            answer: answer
        });
        
        // Update UI
        startButton.disabled = true;
        hangupButton.disabled = false;
        
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleIceCandidate(data) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

function hangUp() {
    // Stop all tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Clear video sources
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    // Update UI
    startButton.disabled = false;
    hangupButton.disabled = true;
}

async function toggleMute() {
    try {
        if (!room || !room.localParticipant) {
            showError('Not connected to room');
            return;
        }

        isMuted = !isMuted;
        await room.localParticipant.setMicrophoneEnabled(!isMuted);
        
        muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
        showSuccess(isMuted ? 'Microphone muted' : 'Microphone unmuted');
    } catch (error) {
        console.error('Error toggling mute:', error);
        showError('Failed to toggle mute: ' + error.message);
    }
}

async function toggleVideo() {
    try {
        if (!room || !room.localParticipant) {
            showError('Not connected to room');
            return;
        }

        isVideoOff = !isVideoOff;
        await room.localParticipant.setCameraEnabled(!isVideoOff);
        
        videoButton.textContent = isVideoOff ? 'Start Video' : 'Stop Video';
        showSuccess(isVideoOff ? 'Camera disabled' : 'Camera enabled');
    } catch (error) {
        console.error('Error toggling video:', error);
        showError('Failed to toggle video: ' + error.message);
    }
}

async function toggleScreenShare() {
    try {
        if (!room || !room.localParticipant) {
            showError('Not connected to room');
            return;
        }

        if (!isScreenSharing) {
            // Start screen sharing
            await room.localParticipant.setScreenShareEnabled(true);
            isScreenSharing = true;
            screenShareButton.textContent = 'Stop Sharing';
            showSuccess('Screen sharing started');
        } else {
            // Stop screen sharing
            await room.localParticipant.setScreenShareEnabled(false);
            isScreenSharing = false;
            screenShareButton.textContent = 'Share Screen';
            showSuccess('Screen sharing stopped');
        }
    } catch (error) {
        console.error('Error toggling screen share:', error);
        showError('Failed to toggle screen share: ' + error.message);
    }
}

async function leaveRoom() {
    try {
        if (confirm('Are you sure you want to leave the room?')) {
            if (room) {
                await room.disconnect();
                room = null;
            }
            resetUI();
            showSuccess('Left the room successfully');
        }
    } catch (error) {
        console.error('Error leaving room:', error);
        showError('Failed to leave room: ' + error.message);
    }
}

// Add utility functions for notifications
function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    showNotification(notification);
}

function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    showNotification(notification);
}

function showWarning(message) {
    const notification = document.createElement('div');
    notification.className = 'notification warning';
    notification.textContent = message;
    showNotification(notification);
}

function showNotification(notification) {
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function resetUI() {
    // Reset UI elements
    document.querySelector('.room-input').style.display = 'block';
    document.querySelector('.video-container').style.display = 'none';
    document.querySelector('.controls').style.display = 'none';
    
    // Clear participants area
    participantsArea.innerHTML = '';
    
    // Reset button states
    muteButton.disabled = true;
    videoButton.disabled = true;
    screenShareButton.disabled = true;
    leaveButton.disabled = true;
    
    // Reset variables
    isMuted = false;
    isVideoOff = false;
    isScreenSharing = false;
}

// Add cleanup function
function cleanup() {
    if (room) {
        room.disconnect();
    }
    resetUI();
}

// Add window unload handler
window.addEventListener('beforeunload', (e) => {
    if (room) {
        e.preventDefault();
        return '';
    }
});

// Add event listeners for room state changes
function setupRoomEventListeners() {
    if (!room) return;

    room.on(LivekitClient.RoomEvent.Connected, () => {
        console.log('Connected to room');
        showSuccess('Connected to room');
    });

    room.on(LivekitClient.RoomEvent.Disconnected, () => {
        console.log('Disconnected from room');
        showError('Disconnected from room');
        resetUI();
    });

    room.on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => {
        console.log('Participant connected:', participant.identity);
        showSuccess(`${participant.identity} joined the room`);
    });

    room.on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('Participant disconnected:', participant.identity);
        showWarning(`${participant.identity} left the room`);
    });

    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === 'video' || track.kind === 'audio') {
            const element = track.attach();
            addParticipantTrack(participant, element);
        }
    });

    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(element => element.remove());
    });
}

function handleLocalTrackPublished(publication) {
    console.log('Local track published:', publication.kind);
    const videoElement = document.getElementById(`video-${room.localParticipant.identity}`);
    if (videoElement && publication.track) {
        console.log('Attaching local track to video element');
        publication.track.attach(videoElement);
    }
}

function handleTrackPublished(publication, participant) {
    console.log('Track published:', publication.kind, 'from', participant.identity);
    if (participant !== room.localParticipant) {
        const videoElement = document.getElementById(`video-${participant.identity}`);
        if (videoElement && publication.track) {
            console.log('Attaching remote track to video element');
            publication.track.attach(videoElement);
        }
    }
}

function handleTrackUnsubscribed(track, participant) {
    console.log('Track unsubscribed:', track.kind, 'from', participant.identity);
    
    if (track.kind === 'audio') {
        const audioElement = document.getElementById(`audio-${participant.identity}`);
        if (audioElement) {
            audioElement.remove();
        }
    }
}

function handleParticipantDisconnected(participant) {
    console.log('Participant disconnected:', participant.identity);
    const participantDiv = document.getElementById(`participant-${participant.identity}`);
    if (participantDiv) {
        participantDiv.remove();
    }
    showWarning(`${participant.identity} left the room`);
}

// Add grant for the room
at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomList: true,
    roomCreate: true,
    roomAdmin: false
}); 