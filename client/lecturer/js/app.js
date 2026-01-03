import ScreenCapture from './screenCapture.js';

/**
 * Main Lecturer Application
 * Handles UI, socket communication, and screen sharing coordination
 */
document.addEventListener('DOMContentLoaded', () => {
    const app = new LecturerApp();
    window.lecturerApp = app; // Expose for debugging
    app.initialize();
});

class LecturerApp {
    constructor() {
        this.socket = null;
        this.screenCapture = null;
        this.studentCount = 0;
        this.isSharing = false;
        this.fpsCounter = new FPSCounter();
        this.dataSent = 0; // Track data sent in bytes
        this.lastFrameTime = 0;
        this.frameId = 0;
        this.animationId = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second delay
        this.maxReconnectDelay = 30000; // Max 30 seconds delay
        this.stream = null;
        // Do not pause sharing when the lecturer tab loses visibility by default
        this.pauseOnHide = false;
        this.isSocketConnected = false;
    }

    initialize() {
        try {
            this.initializeUI();
            this.initializeSocket();
            this.setupVisibilityChangeHandler();
            this.startRealtimeClock();
            this.updateStatus('Ready to share', 'ready');
        } catch (error) {
            console.error('Initialization error:', error);
            this.updateStatus('Initialization failed', 'error');
        }
    }

    startRealtimeClock() {
        const clockDisplay = document.getElementById('lecturerClock');
        if (!clockDisplay) return;

        const updateClock = () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            clockDisplay.textContent = `${hours}:${minutes}:${seconds}`;
        };

        updateClock();
        setInterval(updateClock, 1000);
    }

    initializeUI() {
        try {
            // Set up event listeners for UI controls
            this.startButton = document.getElementById('startSharing');
            this.stopButton = document.getElementById('stopSharing');
            this.qualitySlider = document.getElementById('qualitySlider');
            this.fpsSlider = document.getElementById('fpsSlider');
            this.autoAdjustCheckbox = document.getElementById('autoAdjustQuality');
            
            this.startButton.addEventListener('click', () => this.startSharing());
            this.stopButton.addEventListener('click', () => this.stopSharing());
            
            this.qualitySlider.addEventListener('input', (e) => {
                const quality = Math.round(e.target.value * 100);
                document.getElementById('qualityValue').textContent = `${quality}%`;
                if (this.screenCapture) {
                    this.screenCapture.setQuality(e.target.value);
                }
            });
            
            this.fpsSlider.addEventListener('input', (e) => {
                const fps = e.target.value;
                document.getElementById('fpsValue').textContent = fps;
                if (this.screenCapture) {
                    this.screenCapture.setFPS(parseInt(fps));
                }
            });

            // Initialize video elements
            this.videoElement = document.getElementById('previewVideo');
            this.canvas = document.getElementById('previewCanvas');
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
            
            // Disable stop button initially
            this.stopButton.disabled = true;
            
        } catch (error) {
            console.error('UI initialization error:', error);
            throw error;
        }
    }

    initializeSocket() {
        try {
            // Connect to WebSocket server with reconnection options
            this.socket = io({
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay,
                reconnectionDelayMax: this.maxReconnectDelay,
                timeout: 10000,
                transports: ['websocket'],
                autoConnect: true
            });

            // Connection established
            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.reconnectAttempts = 0;
                this.updateStatus('Connected to server', 'connected');
                this.isSocketConnected = true;
                this.socket.emit('identify', { 
                    type: 'lecturer', 
                    name: 'Lecturer',
                    timestamp: Date.now()
                });
            });

            // Handle disconnection
            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected:', reason);
                this.isSocketConnected = false;
                this.updateStatus('Disconnected from server', 'disconnected');
                if (reason === 'io server disconnect') {
                    // Server forced disconnection, need to manually reconnect
                    this.socket.connect();
                }
            });

            // Handle reconnection attempts
            this.socket.on('reconnect_attempt', (attempt) => {
                this.reconnectAttempts = attempt;
                this.updateStatus(`Reconnecting (attempt ${attempt + 1}/${this.maxReconnectAttempts})...`, 'warning');
            });

            this.socket.on('reconnect_failed', () => {
                this.updateStatus('Failed to reconnect', 'error');
            });

            // Student count updates
            this.socket.on('client-count', (data) => {
                const count = data.count;
                console.log('📊 Received client count:', count);
                this.studentCount = count;
                document.getElementById('studentCount').textContent = count;
                this.updateStatsUI();
            });

            // Handle student screen data
            this.socket.on('student-screen-update', (data) => {
                console.log('📺 Lecturer received student screen:', data.studentId);
                this.displayStudentScreen(data);
            });

            // Handle student raised hand
            this.socket.on('student-raised-hand', (data) => {
                console.log('✋ Student raised hand:', data.name);
                this.showNotification(`${data.name || 'Student'} raised their hand`, 'info');
            });

            // Handle student lowered hand
            this.socket.on('student-lowered-hand', (data) => {
                console.log('🙋 Student lowered hand');
            });

            // Handle student reactions
            this.socket.on('student-reaction', (data) => {
                console.log('😂 Received student reaction:', data.emoji);
                this.showReactionBubble(data.emoji, data.studentId);
            });

            // Handle errors
            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                this.updateStatus(`Connection error: ${error.message}`, 'error');
            });

            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
                this.updateStatus(`Error: ${error.message}`, 'error');
            });

        } catch (error) {
            console.error('Socket initialization error:', error);
            this.updateStatus('Failed to initialize connection', 'error');
            throw error;
        }
    }

    setupVisibilityChangeHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!this.pauseOnHide) return;
            if (document.visibilityState === 'hidden' && this.isSharing) {
                // Pause sharing when tab is hidden to save resources
                this.stopSharing();
            }
        });
    }

        async startSharing() {
            if (this.isSharing) return;

            // Prevent duplicate clicks / re-entrancy by disabling start immediately
            if (this.startButton) this.startButton.disabled = true;

            try {
                // IMPORTANT: getDisplayMedia must be called immediately with user gesture
                // Do NOT await anything before this call
                const constraints = {
                video: {
                    displaySurface: 'monitor',
                    frameRate: { 
                        ideal: parseInt(this.fpsSlider.value),
                        max: 30
                    },
                    width: { 
                        ideal: 1280, 
                        max: 1920 
                    },
                    height: { 
                        ideal: 720, 
                        max: 1080 
                    }
                },
                audio: false
            };

            // Get screen capture stream - MUST be called immediately with user gesture
            try {
                this.stream = await navigator.mediaDevices.getDisplayMedia(constraints);
            } catch (getErr) {
                // Retry with minimal constraints for better compatibility
                console.warn('Initial getDisplayMedia failed:', getErr);
                if (getErr && (getErr.name === 'NotReadableError' || /Could not start video source/i.test(getErr.message || ''))) {
                    try {
                        console.log('Retrying getDisplayMedia with minimal constraints');
                        this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                    } catch (retryErr) {
                        console.error('Retry getDisplayMedia failed:', retryErr);
                        throw retryErr;
                    }
                } else {
                    throw getErr;
                }
            }
            
            // Now we can do other async operations
            // Set up video element
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();
            
            // Set canvas dimensions to match video
            const track = this.stream.getVideoTracks()[0];
            const settings = track.getSettings();
            this.canvas.width = settings.width;
            this.canvas.height = settings.height;
            this.videoElement.style.display = 'block';

            // Update UI
            this.startButton.disabled = true;
            this.stopButton.disabled = false;
            this.updateStatus('Sharing screen...', 'sharing');
            this.isSharing = true;

            // Initialize screen capture with socket and pass the active stream
            console.log('Creating ScreenCapture instance...');
            try {
                this.screenCapture = new ScreenCapture({
                    canvas: this.canvas,
                    video: this.videoElement,
                    socket: this.socket,
                    stream: this.stream
                });
                console.log('✅ ScreenCapture instance created');
            } catch (constructorErr) {
                console.error('❌ ScreenCapture constructor failed:', constructorErr.message);
                throw constructorErr;
            }

            if (!this.screenCapture) {
                throw new Error('ScreenCapture instance is undefined after construction');
            }

            // Start capturing frames
            console.log('Calling startScreenCapture...');
            await this.screenCapture.startScreenCapture();
            console.log('✅ startScreenCapture completed');
            
            // Guard check before calling startCapture
            if (!this.screenCapture) {
                console.error('ScreenCapture instance became null after startScreenCapture()');
                throw new Error('ScreenCapture instance lost after startScreenCapture()');
            }

            // Start the capture loop
            console.log('Calling startCapture...');
            this.screenCapture.startCapture();
            console.log('✅ startCapture called successfully');

            // Handle when user stops sharing from browser UI
            track.onended = () => {
                this.stopSharing();
            };

        } catch (err) {
            console.error('❌ Error starting screen capture:', err.message, err);
            this.updateStatus(`Error: ${err.message}`, 'error');
            this.stopSharing();
        }
    }

    stopSharing() {
        if (!this.isSharing) return;

        // Stop screen capture
        if (this.screenCapture) {
            this.screenCapture.stopScreenCapture();
            this.screenCapture = null;
        }

        // Stop all tracks in the stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                track.onended = null;
            });
            this.stream = null;
        }

        // Clear video element
        this.videoElement.srcObject = null;
        this.videoElement.style.display = 'none';

        // Update UI
        this.isSharing = false;
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        this.updateStatus('Ready to share', 'ready');
    }

    updateStatsUI() {
        // Update data sent
        document.getElementById('dataSent').textContent = 
            (this.dataSent / (1024 * 1024)).toFixed(2) + ' MB';
        
        // Update student count
        document.getElementById('studentCount').textContent = this.studentCount;
    }

    displayStudentScreen(data) {
        const container = document.getElementById('studentScreens');
        const mainContainer = document.getElementById('studentScreensContainer');
        
        if (!container || !mainContainer) return;

        // Show student screens container
        mainContainer.style.display = 'block';

        // Get or create student screen element
        let studentScreenDiv = document.getElementById(`student-screen-${data.studentId}`);
        if (!studentScreenDiv) {
            studentScreenDiv = document.createElement('div');
            studentScreenDiv.id = `student-screen-${data.studentId}`;
            studentScreenDiv.style.cssText = `
                border: 2px solid #FDB913;
                border-radius: 8px;
                overflow: hidden;
                background: #000;
                display: flex;
                flex-direction: column;
            `;
            
            const title = document.createElement('div');
            title.style.cssText = `
                background: linear-gradient(135deg, #003D82, #0055B8);
                color: white;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 600;
            `;
            title.textContent = `Student Screen (${data.studentId.slice(0, 8)})`;
            
            const imageDiv = document.createElement('div');
            imageDiv.style.cssText = `
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                aspect-ratio: 16/9;
            `;
            
            const image = document.createElement('img');
            image.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            `;
            imageDiv.appendChild(image);
            
            studentScreenDiv.appendChild(title);
            studentScreenDiv.appendChild(imageDiv);
            container.appendChild(studentScreenDiv);
        }

        // Update image
        const image = studentScreenDiv.querySelector('img');
        if (image) {
            image.src = data.image;
        }
    }

    showReactionBubble(emoji, studentId) {
        const bubble = document.createElement('div');
        bubble.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            font-size: 48px;
            animation: floatUp 2s ease-out forwards;
            z-index: 1000;
            pointer-events: none;
        `;
        bubble.textContent = emoji;
        
        document.body.appendChild(bubble);
        
        setTimeout(() => bubble.remove(), 2000);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: #FDB913;
            color: #003D82;
            padding: 12px 20px;
            border-radius: 6px;
            font-weight: 600;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: slideDown 0.3s ease-out;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 4000);
    }

    updateStatus(message, status) {
        const statusElement = document.getElementById('status');
        const statusContainer = document.getElementById('statusContainer');
        
        if (statusElement) {
            statusElement.textContent = message;
            statusContainer.className = `status ${status}`;
        }
    }
}

/**
 * FPSCounter - Tracks and calculates frames per second
 */
class FPSCounter {
    constructor() {
        this.lastFrameTime = 0;
        this.frameTimes = [];
        this.fps = 0;
        this.sampleSize = 10; // Number of frames to average over
    }

    tick() {
        const now = performance.now();
        const delta = now - this.lastFrameTime;
        
        if (delta > 0) {
            this.lastFrameTime = now;
            this.frameTimes.push(delta);
            
            // Keep only the most recent frame times
            while (this.frameTimes.length > this.sampleSize) {
                this.frameTimes.shift();
            }
            
            // Calculate average FPS
            const avgDelta = this.frameTimes.reduce((sum, time) => sum + time, 0) / this.frameTimes.length;
            this.fps = 1000 / avgDelta;
        }
        
        return this.fps;
    }

    getFPS() {
        return this.fps;
    }
}