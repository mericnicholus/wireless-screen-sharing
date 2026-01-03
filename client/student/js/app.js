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

        // Create a visual flash element to indicate a received frame
        try {
            this.frameFlash = document.createElement('div');
            this.frameFlash.id = 'frameFlash';
            Object.assign(this.frameFlash.style, {
                position: 'absolute',
                inset: '0px',
                border: '4px solid rgba(0,180,255,0)',
                borderRadius: '6px',
                pointerEvents: 'none',
                transition: 'border-color 180ms ease',
                zIndex: 999
            });
            if (this.elements.screen) {
                this.elements.screen.style.position = this.elements.screen.style.position || 'relative';
                this.elements.screen.appendChild(this.frameFlash);
            } else {
                document.body.appendChild(this.frameFlash);
            }
        } catch (e) {
            console.warn('Could not create frame flash element', e);
        }
        
        this.fpsCounter = new FPSCounter();
        this.initializeEventListeners();
        this.setupFullscreenHandler();
    }

    setupFullscreenHandler() {
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const screenContainer = document.querySelector('.screen-container');
        
        if (!fullscreenBtn || !screenContainer) return;
        
        fullscreenBtn.addEventListener('click', async () => {
            try {
                if (!document.fullscreenElement) {
                    // Enter fullscreen
                    if (screenContainer.requestFullscreen) {
                        await screenContainer.requestFullscreen();
                        fullscreenBtn.textContent = '⛶ Exit Fullscreen';
                    } else if (screenContainer.webkitRequestFullscreen) {
                        screenContainer.webkitRequestFullscreen();
                        fullscreenBtn.textContent = '⛶ Exit Fullscreen';
                    }
                } else {
                    // Exit fullscreen
                    if (document.exitFullscreen) {
                        await document.exitFullscreen();
                        fullscreenBtn.textContent = '⛶ Fullscreen';
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                        fullscreenBtn.textContent = '⛶ Fullscreen';
                    }
                }
            } catch (error) {
                console.error('Fullscreen error:', error);
            }
        });
        
        // Update button text when fullscreen state changes
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                fullscreenBtn.textContent = '⛶ Exit Fullscreen';
            } else {
                fullscreenBtn.textContent = '⛶ Fullscreen';
            }
        });
    }

    initialize() {
        this.initializeSocket();
        this.setupControlHandlers();
        this.startRealtimeClock();
        this.startConnectionMonitor();
    }

    setupControlHandlers() {
        // Raise hand button
        const raiseHandBtn = document.getElementById('raiseHandBtn');
        const lowerHandBtn = document.getElementById('lowerHandBtn');
        const raiseHandNotif = document.getElementById('raiseHandNotif');
        let handRaised = false;

        if (raiseHandBtn) {
            raiseHandBtn.addEventListener('click', () => {
                handRaised = !handRaised;
                if (handRaised) {
                    raiseHandBtn.style.background = 'rgba(220, 53, 69, 0.3)';
                    raiseHandBtn.style.borderColor = '#dc3545';
                    raiseHandNotif.style.display = 'flex';
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('student-raised-hand', { name: 'Student' });
                    }
                } else {
                    raiseHandBtn.style.background = 'rgba(0,0,0,0.6)';
                    raiseHandBtn.style.borderColor = 'rgba(255,255,255,0.3)';
                    raiseHandNotif.style.display = 'none';
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('student-lowered-hand', {});
                    }
                }
            });
        }

        if (lowerHandBtn) {
            lowerHandBtn.addEventListener('click', () => {
                handRaised = false;
                raiseHandBtn.style.background = 'rgba(0,0,0,0.6)';
                raiseHandBtn.style.borderColor = 'rgba(255,255,255,0.3)';
                raiseHandNotif.style.display = 'none';
                if (this.socket && this.socket.connected) {
                    this.socket.emit('student-lowered-hand', {});
                }
            });
        }

        // Reaction button
        const reactBtn = document.getElementById('reactBtn');
        const reactionPopup = document.getElementById('reactionPopup');
        let showingReactions = false;

        if (reactBtn) {
            reactBtn.addEventListener('click', () => {
                showingReactions = !showingReactions;
                reactionPopup.style.display = showingReactions ? 'flex' : 'none';
            });
        }

        const reactionBtns = document.querySelectorAll('.reaction-btn');
        reactionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const reaction = e.target.dataset.reaction;
                if (this.socket && this.socket.connected) {
                    this.socket.emit('student-reaction', { emoji: reaction });
                }
                reactionPopup.style.display = 'none';
                showingReactions = false;
            });
        });

        // Share screen button
        const shareScreenBtn = document.getElementById('shareScreenBtn');
        let studentSharingStream = null;
        let studentSharingActive = false;

        if (shareScreenBtn) {
            shareScreenBtn.addEventListener('click', async () => {
                try {
                    if (!studentSharingActive) {
                        // Start sharing
                        const stream = await navigator.mediaDevices.getDisplayMedia({
                            video: { cursor: 'always' },
                            audio: false
                        });
                        
                        studentSharingStream = stream;
                        studentSharingActive = true;
                        shareScreenBtn.style.background = 'rgba(40, 167, 69, 0.3)';
                        shareScreenBtn.style.borderColor = '#28a745';
                        shareScreenBtn.textContent = '📺 Stop Sharing';
                        
                        console.log('✅ Student started screen sharing');
                        this.startStudentScreenCapture(stream, shareScreenBtn);
                        
                        // Handle stream end (user stops sharing from browser)
                        stream.getTracks()[0].onended = () => {
                            studentSharingActive = false;
                            studentSharingStream = null;
                            shareScreenBtn.style.background = 'rgba(0,0,0,0.6)';
                            shareScreenBtn.style.borderColor = 'rgba(255,255,255,0.3)';
                            shareScreenBtn.textContent = '📺 Share Screen';
                            this.stopStudentScreenCapture();
                        };
                    } else {
                        // Stop sharing
                        studentSharingActive = false;
                        if (studentSharingStream) {
                            studentSharingStream.getTracks().forEach(track => track.stop());
                            studentSharingStream = null;
                        }
                        shareScreenBtn.style.background = 'rgba(0,0,0,0.6)';
                        shareScreenBtn.style.borderColor = 'rgba(255,255,255,0.3)';
                        shareScreenBtn.textContent = '📺 Share Screen';
                        this.stopStudentScreenCapture();
                        console.log('⏹ Student stopped screen sharing');
                    }
                } catch (error) {
                    if (error.name !== 'NotAllowedError') {
                        console.error('Share screen error:', error);
                    }
                    shareScreenBtn.style.background = 'rgba(0,0,0,0.6)';
                    shareScreenBtn.style.borderColor = 'rgba(255,255,255,0.3)';
                    shareScreenBtn.textContent = '📺 Share Screen';
                }
            });
        }

        // Close reaction popup on click outside
        document.addEventListener('click', (e) => {
            if (reactionPopup && !reactBtn?.contains(e.target) && !reactionPopup.contains(e.target)) {
                reactionPopup.style.display = 'none';
                showingReactions = false;
            }
        });
    }

    startStudentScreenCapture(stream, btn) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const video = document.createElement('video');
        
        video.srcObject = stream;
        video.play();
        
        let captureActive = true;
        let frameId = 0;
        
        const captureFrame = async () => {
            if (!captureActive || !ctx) return;
            
            try {
                canvas.width = video.videoWidth || 1280;
                canvas.height = video.videoHeight || 720;
                
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/jpeg', 0.5);
                
                // Send student screen frames to server
                if (this.socket && this.socket.connected) {
                    this.socket.emit('student-screen-data', {
                        image: imageData,
                        frameId: frameId++,
                        timestamp: Date.now(),
                        resolution: `${canvas.width}x${canvas.height}`,
                        isStudentSharing: true
                    });
                }
            } catch (error) {
                console.error('Student frame capture error:', error);
            }
            
            if (captureActive) {
                requestAnimationFrame(captureFrame);
            }
        };
        
        video.onloadedmetadata = () => {
            captureFrame();
        };
        
        this.studentCaptureCleanup = () => {
            captureActive = false;
            video.srcObject = null;
        };
    }

    stopStudentScreenCapture() {
        if (this.studentCaptureCleanup) {
            this.studentCaptureCleanup();
            this.studentCaptureCleanup = null;
        }
    }

    startRealtimeClock() {
        const clockDisplay = document.getElementById('realTimeClock');
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
            console.debug('📥 Student received raw screen-update event:', data);
            console.log('📥 Student received screen-update event:', data ? 'has data' : 'no data');
            if (data) {
                console.log('Frame details:', {
                    frameId: data.frameId,
                    size: data.size ? `${(data.size / 1024).toFixed(1)}KB` : (data.image ? `${Math.round((data.image.length || 0)/1024)}KB (base64)` : 'unknown'),
                    hasImage: !!data.image
                });
            }
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

            // Ensure onload/onerror handlers are set before assigning src
            requestAnimationFrame(() => {
                const messageEl = document.getElementById('screenMessage');
                console.debug('Updating screen image. imageData length:', imageData ? imageData.length : 0);

                img.onload = () => {
                    this.lastFrameTime = performance.now();
                    this.updateLastUpdated();
                    img.classList.add('visible');
                    if (messageEl) {
                        messageEl.style.display = 'none';
                        console.log('✅ Message hidden, image visible');
                    }
                    // Visual feedback: flash border when a new frame loads
                    try {
                        if (this.frameFlash) {
                            this.frameFlash.style.borderColor = 'rgba(0,180,255,0.95)';
                            setTimeout(() => {
                                if (this.frameFlash) this.frameFlash.style.borderColor = 'rgba(0,180,255,0)';
                            }, 120);
                        }
                    } catch (err) {
                        console.debug('Frame flash failed', err);
                    }
                };

                img.onerror = (e) => {
                    console.error('Failed to load image:', e);
                    this.showError('Failed to display screen');
                };

                // Assign src after handlers are attached
                img.src = imageData;
                console.debug('Assigned img.src');
            });
        } catch (error) {
            console.error('Error updating screen:', error);
            this.showError('Error displaying screen');
        }
    }

    updateStats(data) {
        // Removed stats display from student side - kept for internal use
        // This data is now only used for connection quality assessment
    }

    updateConnectionQuality(latency, fps) {
        let quality = 'good';
        let className = 'good';
        
        // More lenient thresholds for better user experience
        // Good: 20+ FPS, <100ms latency
        // Fair: 15+ FPS, <200ms latency
        // Poor: Below fair thresholds
        if (latency > 300 || fps < 12) {
            quality = 'poor';
            className = 'poor';
        } else if (latency > 150 || fps < 18) {
            quality = 'fair';
            className = 'fair';
        }

        if (quality !== this.connectionQuality) {
            this.connectionQuality = quality;
            const indicator = document.getElementById('connectionStatus');
            if (indicator) {
                indicator.className = `connection-indicator ${className}`;
                const statusText = quality.charAt(0).toUpperCase() + quality.slice(1);
                indicator.textContent = `● ${statusText}`;
            }
        }
    }

    updateStatus(message, status) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${status}`;
    }

    updateLastUpdated() {
        // Method kept for compatibility but lastUpdate element no longer exists
        // Time is now shown in the real-time clock instead
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