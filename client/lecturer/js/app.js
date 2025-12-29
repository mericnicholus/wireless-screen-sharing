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
        this.isSocketConnected = false;
    }

    initialize() {
        try {
            this.initializeUI();
            this.initializeSocket();
            this.setupVisibilityChangeHandler();
            this.updateStatus('Ready to share', 'ready');
        } catch (error) {
            console.error('Initialization error:', error);
            this.updateStatus('Initialization failed', 'error');
        }
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
            this.socket.on('student-count', (count) => {
                this.studentCount = count;
                document.getElementById('studentCount').textContent = count;
                this.updateStatsUI();
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
            if (document.visibilityState === 'hidden' && this.isSharing) {
                // Pause sharing when tab is hidden to save resources
                this.stopSharing();
            }
        });
    }

        async startSharing() {
        if (this.isSharing) return;

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
            this.stream = await navigator.mediaDevices.getDisplayMedia(constraints);
            
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

            // Initialize screen capture with socket
            this.screenCapture = new ScreenCapture({
                canvas: this.canvas,
                video: this.videoElement,
                socket: this.socket
            });

            // Start capturing frames
            await this.screenCapture.startScreenCapture();
            this.screenCapture.startCapture();

            // Handle when user stops sharing from browser UI
            track.onended = () => {
                this.stopSharing();
            };

        } catch (err) {
            console.error('Error starting screen capture:', err);
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