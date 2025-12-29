/**
 * Student Application for Wireless Screen Sharing
 * Handles receiving and displaying screen updates from lecturer
 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        const app = new StudentApp();
        window.studentApp = app; // Expose for debugging
        app.initialize();
    } catch (error) {
        console.error('Failed to initialize StudentApp:', error);
        document.getElementById('app-error').style.display = 'block';
    }
});

class StudentApp {
    constructor() {
        this.socket = null;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.droppedFrames = 0;
        this.lastFrameId = 0;
        this.connectionQuality = 'good';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        
        // DOM Elements
        this.elements = {
            screen: document.getElementById('screen'),
            screenImage: document.getElementById('screenImage'),
            status: document.getElementById('status'),
            frameRate: document.getElementById('frameRate'),
            latency: document.getElementById('latency'),
            lastUpdate: document.getElementById('lastUpdate'),
            connectionQuality: document.getElementById('connectionQuality'),
            errorDisplay: document.getElementById('error-display')
        };
        
        this.fpsCounter = new FPSCounter();
        this.initializeEventListeners();
    }

    initialize() {
        this.initializeSocket();
        this.updateLastUpdated();
        this.startConnectionMonitor();
    }

    initializeEventListeners() {
        window.addEventListener('offline', () => this.handleConnectionChange(false));
        window.addEventListener('online', () => this.handleConnectionChange(true));
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    initializeSocket() {
        try {
            this.socket = io({
                transports: ['websocket'],
                upgrade: false,
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: 1000,
                timeout: 10000
            });

            this.setupSocketHandlers();
        } catch (error) {
            console.error('Failed to initialize socket:', error);
            this.showError('Failed to connect to server');
            this.attemptReconnect();
        }
    }

    setupSocketHandlers() {
        const socket = this.socket;

        socket.on('connect', () => {
            console.log('Connected to server');
            this.reconnectAttempts = 0;
            this.updateStatus('Connected to server', 'connected');
            socket.emit('identify', { 
                type: 'student', 
                name: 'Student',
                device: navigator.userAgent,
                resolution: `${window.screen.width}x${window.screen.height}`
            });
        });

        socket.on('screen-update', (data) => {
            try {
                this.handleScreenUpdate(data);
                this.updateStats(data);
            } catch (error) {
                console.error('Error processing screen update:', error);
            }
        });

        socket.on('lecturer-connected', (data) => {
            console.log('Lecturer connected:', data);
            this.updateStatus(`Connected to lecturer: ${data.name || 'Unknown'}`, 'connected');
            this.showNotification('Lecturer is now online');
        });

        socket.on('lecturer-disconnected', () => {
            console.log('Lecturer disconnected');
            this.updateStatus('Waiting for lecturer...', 'disconnected');
            this.showNotification('Lecturer has disconnected');
            this.clearScreen();
        });

        socket.on('lecturer-status', (data) => {
            if (!data.isOnline) {
                this.updateStatus('Waiting for lecturer...', 'disconnected');
                this.showNotification('Lecturer is offline');
                this.clearScreen();
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.handleConnectionError(error);
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            this.updateStatus('Disconnected from server', 'disconnected');
            this.attemptReconnect();
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError('Connection error occurred');
        });
    }

    handleScreenUpdate(data) {
        if (!data || !data.image) {
            console.warn('Received invalid screen update');
            return;
        }

        this.frameCount++;
        
        // Check for dropped frames
        if (data.frameId) {
            if (this.lastFrameId > 0 && data.frameId > this.lastFrameId + 1) {
                this.droppedFrames += data.frameId - (this.lastFrameId + 1);
            }
            this.lastFrameId = data.frameId;
        }

        this.updateScreen(data.image);
        this.updateConnectionQuality();
    }

    updateScreen(imageData) {
        try {
            const img = this.elements.screenImage;
            
            if (!img) {
                this.showError('Screen image element not found');
                return;
            }

            // Use requestAnimationFrame for smoother updates
            requestAnimationFrame(() => {
                img.src = imageData;
                if (!img.onload) {
                    img.onload = () => {
                        this.lastFrameTime = performance.now();
                        this.updateLastUpdated();
                        img.classList.add('visible');
                    };
                    img.onerror = (e) => {
                        console.error('Failed to load image:', e);
                        this.showError('Failed to display screen');
                    };
                }
            });
        } catch (error) {
            console.error('Error updating screen:', error);
            this.showError('Error displaying screen');
        }
    }

    updateStats(data) {
        // Update FPS
        const fps = this.fpsCounter.tick();
        this.elements.frameRate.textContent = `${fps} FPS`;

        // Update latency if timestamp is available
        if (data.timestamp) {
            const latency = Date.now() - data.timestamp;
            this.elements.latency.textContent = `${latency}ms`;
            this.updateConnectionQuality(latency, fps);
        }
    }

    updateConnectionQuality(latency, fps) {
        let quality = 'good';
        let className = 'good';
        
        if (latency > 500 || fps < 5) {
            quality = 'poor';
            className = 'poor';
        } else if (latency > 200 || fps < 10) {
            quality = 'fair';
            className = 'fair';
        }

        if (quality !== this.connectionQuality) {
            this.connectionQuality = quality;
            this.elements.connectionQuality.textContent = quality;
            this.elements.connectionQuality.className = className;
        }
    }

    updateStatus(message, status) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${status}`;
    }

    updateLastUpdated() {
        const now = new Date();
        this.elements.lastUpdate.textContent = now.toLocaleTimeString();
    }

    showError(message) {
        console.error('Error:', message);
        if (this.elements.errorDisplay) {
            this.elements.errorDisplay.textContent = message;
            this.elements.errorDisplay.style.display = 'block';
        }
    }

    showNotification(message, duration = 3000) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    clearScreen() {
        this.elements.screen.innerHTML = `
            <div class="no-content">
                <p>No active screen sharing session</p>
            </div>
        `;
    }

    handleConnectionChange(isOnline) {
        if (isOnline) {
            this.updateStatus('Reconnecting...', 'connecting');
            this.attemptReconnect();
        } else {
            this.updateStatus('Offline - Waiting for network...', 'disconnected');
        }
    }

    attemptReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            this.updateStatus(`Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, 'connecting');
            
            this.reconnectTimeout = setTimeout(() => {
                if (this.socket) {
                    this.socket.connect();
                }
            }, delay);
        } else {
            this.showError('Failed to reconnect. Please refresh the page.');
        }
    }

    startConnectionMonitor() {
        // Monitor connection quality periodically
        setInterval(() => {
            if (this.lastFrameTime > 0) {
                const timeSinceLastFrame = Date.now() - this.lastFrameTime;
                if (timeSinceLastFrame > 5000) { // No frames for 5 seconds
                    this.updateStatus('Connection unstable', 'warning');
                }
            }
        }, 10000);
    }

    cleanup() {
        if (this.socket) {
            this.socket.off(); // Remove all listeners
            this.socket.disconnect();
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
    }
}

class FPSCounter {
    constructor() {
        this.lastFrameTime = performance.now();
        this.frameTimes = [];
        this.fps = 0;
    }

    tick() {
        const now = performance.now();
        const delta = now - this.lastFrameTime;
        this.lastFrameTime = now;
        
        // Add delta to frame times
        this.frameTimes.push(delta);
        
        // Keep only last 30 frames for calculation
        if (this.frameTimes.length > 30) {
            this.frameTimes.shift();
        }
        
        // Calculate average frame time and FPS
        const avgDelta = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.fps = Math.round(1000 / avgDelta);
        
        return this.fps;
    }
}