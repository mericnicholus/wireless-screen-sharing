/**
 * Screen Capture Module for Lecturer
 * Handles screen capture, frame processing, and optimization
 */
class ScreenCapture {
    constructor(options = {}) {
        this.stream = null;
        this.videoElement = options.video || document.getElementById('previewVideo');
        this.canvasElement = options.canvas || document.getElementById('previewCanvas');
        this.ctx = this.canvasElement?.getContext('2d', { willReadFrequently: true });
        this.socket = options.socket || null;
        this.captureInterval = null;
        this.rafId = null;
        this.frameId = 0;
        this.lastFrameTime = 0;
        this.framesSent = 0;
        this.totalDataSent = 0;
        
        // Performance metrics
        this.metrics = {
            fps: 0,
            latency: 0,
            quality: 0.7,
            frameSize: 0,
            droppedFrames: 0,
            encodeTime: 0,
            networkLatency: 0
        };
        
        // Default settings
        this.settings = {
            quality: 0.7,
            fps: 10,
            resolution: '720p',
            isSharing: false,
            useCompression: true,
            captureMethod: 'canvas',
            frameSkip: 0,
            frameSkipCount: 0,
            maxFrameSize: 1.5 * 1024 * 1024,
            autoAdjustQuality: true
        };
        
        // Initialize settings from UI
        this.initSettings();
        this.initEventListeners();
    }
    
    initSettings() {
        // Initialize UI controls
        this.updateUISettings();
        
        // Add event listeners for UI controls
        const qualitySlider = document.getElementById('qualitySlider');
        const fpsSlider = document.getElementById('fpsSlider');
        const resolutionSelect = document.getElementById('resolutionSelect');
        const autoAdjustCheckbox = document.getElementById('autoAdjustQuality');
        
        if (qualitySlider) {
            qualitySlider.addEventListener('input', (e) => {
                this.settings.quality = parseFloat(e.target.value);
                this.updateUISettings();
            });
        }
        
        if (fpsSlider) {
            fpsSlider.addEventListener('input', (e) => {
                this.settings.fps = parseInt(e.target.value);
                this.updateUISettings();
                this.restartCaptureIfNeeded();
            });
        }
        
        if (resolutionSelect) {
            resolutionSelect.addEventListener('change', (e) => {
                this.settings.resolution = e.target.value;
                this.restartCaptureIfNeeded();
            });
        }
        
        if (autoAdjustCheckbox) {
            autoAdjustCheckbox.addEventListener('change', (e) => {
                this.settings.autoAdjustQuality = e.target.checked;
            });
        }
    }
    
    initEventListeners() {
        // Add visibility change handler
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseCapture();
            } else if (this.settings.isSharing) {
                this.resumeCapture();
            }
        });
    }
    
    updateUISettings() {
        const qualityValue = document.getElementById('qualityValue');
        const fpsValue = document.getElementById('fpsValue');
        
        if (qualityValue) {
            qualityValue.textContent = `${Math.round(this.settings.quality * 100)}%`;
        }
        
        if (fpsValue) {
            fpsValue.textContent = `${this.settings.fps} FPS`;
        }
        
        // Update slider values
        const qualitySlider = document.getElementById('qualitySlider');
        const fpsSlider = document.getElementById('fpsSlider');
        
        if (qualitySlider) qualitySlider.value = this.settings.quality;
        if (fpsSlider) fpsSlider.value = this.settings.fps;
    }
    
    async startScreenCapture() {
        try {
            if (this.stream) {
                await this.stopScreenCapture();
            }
            
            console.log('🖥️ Starting screen capture...');
            
            const displayMediaOptions = this.getDisplayMediaOptions();
            this.stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
            
            // Setup video element
            await this.setupVideoElement();
            
            // Start performance monitoring
            this.startPerformanceMonitoring();
            
            console.log('✅ Screen capture started successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Error starting screen capture:', error);
            this.handleCaptureError(error);
            throw error;
        }
    }
    
    getDisplayMediaOptions() {
        // Calculate resolution based on settings
        let width, height;
        switch (this.settings.resolution) {
            case '480p':
                width = 854; height = 480; break;
            case '720p':
                width = 1280; height = 720; break;
            case '1080p':
                width = 1920; height = 1080; break;
            default:
                width = 1280; height = 720;
        }
        
        return {
            video: {
                displaySurface: "monitor",
                frameRate: { ideal: this.settings.fps, max: 30 },
                width: { ideal: width, max: width },
                height: { ideal: height, max: height },
                resizeMode: "none"
            },
            audio: false,
            preferCurrentTab: false,
            selfBrowserSurface: "exclude"
        };
    }
    
    setupTrackEndHandler() {
        const videoTrack = this.stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.onended = () => {
                console.log('🛑 Screen sharing stopped by user');
                this.handleCaptureStopped();
            };
        }
    }
    
    async setupVideoElement() {
        if (!this.videoElement) return;
        
        this.videoElement.srcObject = this.stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            this.videoElement.onloadedmetadata = () => {
                this.adjustCanvasSize();
                resolve();
            };
        });
    }
    
    adjustCanvasSize() {
        if (!this.canvasElement || !this.videoElement) return;
        
        // Adjust canvas size based on video dimensions and selected resolution
        let width = this.videoElement.videoWidth;
        let height = this.videoElement.videoHeight;
        
        // Apply resolution constraints
        const maxRes = this.getMaxResolution();
        const scale = Math.min(maxRes.width / width, maxRes.height / height, 1);
        
        this.canvasElement.width = Math.floor(width * scale);
        this.canvasElement.height = Math.floor(height * scale);
        
        console.log(`📐 Capture resolution: ${this.canvasElement.width}x${this.canvasElement.height}`);
    }
    
    getMaxResolution() {
        switch (this.settings.resolution) {
            case '480p': return { width: 854, height: 480 };
            case '720p': return { width: 1280, height: 720 };
            case '1080p': return { width: 1920, height: 1080 };
            default: return { width: 1280, height: 720 };
        }
    }
    
    startCapture() {
        if (!this.stream || !this.ctx) {
            console.error('Cannot start capture: Stream or context not available');
            return false;
        }
        
        this.settings.isSharing = true;
        this.frameId = 0;
        this.framesSent = 0;
        this.totalDataSent = 0;
        this.lastFrameTime = performance.now();
        
        // Clear any existing interval
        this.stopCapture();
        
        // Start capture loop using requestAnimationFrame for better timing
        const frameInterval = 1000 / this.settings.fps;
        let lastFrameTime = 0;
        
        const captureFrame = (timestamp) => {
            if (!this.settings.isSharing) return;
            
            const now = performance.now();
            const elapsed = now - lastFrameTime;
            
            if (elapsed >= frameInterval) {
                lastFrameTime = now - (elapsed % frameInterval);
                this.captureAndProcessFrame();
            }
            
            this.rafId = requestAnimationFrame(captureFrame);
        };
        
        this.rafId = requestAnimationFrame(captureFrame);
        console.log(`🎬 Capture started at ${this.settings.fps} FPS`);
        console.log(`Socket status: connected=${this.socket?.connected}, socket=${this.socket ? 'exists' : 'null'}`);
        return true;
    }
    
    async captureAndProcessFrame() {
        if (!this.settings.isSharing || !this.ctx || !this.videoElement) {
            return null;
        }
        
        const captureStartTime = performance.now();
        let frameData = null;
        
        try {
            // Skip frames if needed
            if (this.settings.frameSkip > 0) {
                this.settings.frameSkipCount = (this.settings.frameSkipCount + 1) % (this.settings.frameSkip + 1);
                if (this.settings.frameSkipCount !== 0) {
                    return null;
                }
            }
            
            // Draw frame to canvas
            this.ctx.drawImage(
                this.videoElement,
                0, 0,
                this.canvasElement.width,
                this.canvasElement.height
            );
            
            // Encode frame to JPEG
            const encodeStart = performance.now();
            const imageData = await this.encodeFrame();
            const encodeTime = performance.now() - encodeStart;
            
            if (!imageData) return null;
            
            // Check frame size and adjust quality if needed
            if (this.settings.autoAdjustQuality && imageData.length > this.settings.maxFrameSize) {
                this.adjustQualityBasedOnSize(imageData.length);
                return null; // Skip this frame, next one will use adjusted quality
            }
            
            // Prepare frame data
            frameData = {
                image: imageData,
                frameId: this.frameId++,
                timestamp: Date.now(),
                captureTime: performance.now() - captureStartTime,
                encodeTime: encodeTime,
                size: imageData.length,
                resolution: {
                    width: this.canvasElement.width,
                    height: this.canvasElement.height
                },
                quality: this.settings.quality
            };
            
            // Send frame
            this.sendFrame(frameData);
            
            // Update metrics
            this.updateMetrics(frameData);
            
            return frameData;
            
        } catch (error) {
            console.error('Error in captureAndProcessFrame:', error);
            this.metrics.droppedFrames++;
            return null;
        }
    }
    
    async encodeFrame() {
        try {
            // Use web worker for encoding if available
            if (window.Worker && this.settings.useCompression) {
                return await this.encodeWithWorker();
            } else {
                // Fallback to canvas toDataURL
                return this.canvasElement.toDataURL('image/jpeg', this.settings.quality);
            }
        } catch (error) {
            console.error('Error encoding frame:', error);
            return null;
        }
    }
    
    async encodeWithWorker() {
        // Implement web worker for off-thread encoding
        return new Promise((resolve) => {
            // Fallback to canvas if worker fails
            setTimeout(() => {
                resolve(this.canvasElement.toDataURL('image/jpeg', this.settings.quality));
            }, 0);
        });
    }
    
    sendFrame(frameData) {
        if (!this.socket) {
            console.error('❌ Socket is null, cannot send frame');
            return;
        }

        if (!this.socket.connected) {
            console.warn('⚠️ Socket not connected, attempting to reconnect...');
            this.socket.connect();
            return;
        }

        try {
            this.socket.emit('screen-data', {
                image: frameData.image,
                frameId: frameData.frameId,
                timestamp: frameData.timestamp,
                size: frameData.size,
                quality: frameData.quality,
                resolution: frameData.resolution
            });

            this.framesSent++;
            this.totalDataSent += frameData.size;

        } catch (error) {
            console.error('❌ Error sending frame:', error);
            this.metrics.droppedFrames++;
        }
    }
    
    adjustQualityBasedOnSize(frameSize) {
        if (frameSize > this.settings.maxFrameSize) {
            // Reduce quality
            const newQuality = Math.max(0.1, this.settings.quality * 0.9);
            if (Math.abs(newQuality - this.settings.quality) > 0.05) {
                this.settings.quality = parseFloat(newQuality.toFixed(2));
                this.updateUISettings();
                console.log(`🔧 Adjusted quality to ${Math.round(this.settings.quality * 100)}% due to large frame size`);
            }
        } else if (frameSize < this.settings.maxFrameSize * 0.5) {
            // Increase quality if there's room
            const newQuality = Math.min(0.9, this.settings.quality * 1.1);
            if (Math.abs(newQuality - this.settings.quality) > 0.05) {
                this.settings.quality = parseFloat(newQuality.toFixed(2));
                this.updateUISettings();
                console.log(`🔧 Increased quality to ${Math.round(this.settings.quality * 100)}%`);
            }
        }
    }
    
    updateMetrics(frameData) {
        const now = performance.now();
        
        // Calculate FPS
        if (this.lastFrameTime > 0) {
            const elapsed = now - this.lastFrameTime;
            this.metrics.fps = 1000 / elapsed;
        }
        
        // Update other metrics
        this.metrics.latency = frameData.captureTime;
        this.metrics.frameSize = frameData.size;
        this.metrics.encodeTime = frameData.encodeTime;
        this.metrics.quality = frameData.quality;
        this.lastFrameTime = now;
        
        // Update UI
        this.updateMetricsUI();
    }
    
    updateMetricsUI() {
        // Update FPS display
        const fpsElement = document.getElementById('frameRate');
        if (fpsElement) {
            fpsElement.textContent = `${this.metrics.fps.toFixed(1)} FPS`;
        }
        
        // Update latency display
        const latencyElement = document.getElementById('latency');
        if (latencyElement) {
            latencyElement.textContent = `${this.metrics.latency.toFixed(1)}ms`;
        }
        
        // Update data rate
        const dataRateElement = document.getElementById('dataRate');
        if (dataRateElement) {
            const kbps = (this.totalDataSent / 1024).toFixed(1);
            dataRateElement.textContent = `${kbps} KB`;
        }
        
        // Update frame counter
        const frameCountElement = document.getElementById('frameCount');
        if (frameCountElement) {
            frameCountElement.textContent = this.framesSent;
        }
        
        // Update quality indicator
        const qualityIndicator = document.getElementById('qualityIndicator');
        if (qualityIndicator) {
            qualityIndicator.textContent = `${Math.round(this.metrics.quality * 100)}%`;
        }
    }
    
    startPerformanceMonitoring() {
        if (this.performanceMonitor) {
            clearInterval(this.performanceMonitor);
        }
        
        this.performanceMonitor = setInterval(() => {
            const avgFrameSize = this.framesSent > 0 ? 
                (this.totalDataSent / this.framesSent) : 0;
            
            console.log(`📊 Performance: ${this.metrics.fps.toFixed(1)} FPS, ` +
                       `${(avgFrameSize / 1024).toFixed(1)} KB/frame, ` +
                       `${this.metrics.droppedFrames} dropped frames, ` +
                       `Quality: ${Math.round(this.metrics.quality * 100)}%`);
            
            // Reset counters for next period
            this.metrics.droppedFrames = 0;
            
        }, 10000); // Every 10 seconds
    }
    
    pauseCapture() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        console.log('⏸ Capture paused');
    }
    
    resumeCapture() {
        if (!this.settings.isSharing) return;
        this.startCapture();
        console.log('▶️ Capture resumed');
    }
    
    stopCapture() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        
        this.settings.isSharing = false;
        console.log('⏹ Capture stopped');
    }
    
    async stopScreenCapture() {
        this.stopCapture();
        
        if (this.stream) {
            // Stop all tracks
            this.stream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.stream = null;
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        
        // Clear canvas
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
        
        // Stop performance monitoring
        if (this.performanceMonitor) {
            clearInterval(this.performanceMonitor);
            this.performanceMonitor = null;
        }
        
        console.log('🛑 Screen capture stopped completely');
    }
    
    restartCaptureIfNeeded() {
        if (this.settings.isSharing) {
            this.stopCapture();
            setTimeout(() => this.startCapture(), 100);
        }
    }
    
    handleCaptureError(error) {
        console.error('Capture error:', error);
        this.stopScreenCapture();
        
        // Notify UI about the error
        if (typeof this.onError === 'function') {
            this.onError(error);
        }
    }
    
    // Set WebSocket connection
    setSocket(socket) {
        this.socket = socket;
    }
    
    // Get current settings
    getSettings() {
        return { ...this.settings };
    }
    
    // Update settings
    updateSettings(newSettings) {
        const needsRestart = 
            (newSettings.fps !== undefined && newSettings.fps !== this.settings.fps) ||
            (newSettings.resolution !== undefined && newSettings.resolution !== this.settings.resolution);
        
        Object.assign(this.settings, newSettings);
        this.updateUISettings();
        
        if (needsRestart && this.settings.isSharing) {
            this.restartCaptureIfNeeded();
        }
    }
    
    // Get performance metrics
    getMetrics() {
        return { ...this.metrics };
    }
    
    // Cleanup
    destroy() {
        this.stopScreenCapture();
        this.settings = null;
        this.metrics = null;
        
        if (this.performanceMonitor) {
            clearInterval(this.performanceMonitor);
            this.performanceMonitor = null;
        }
    }

        // Set quality
    setQuality(quality) {
        this.settings.quality = parseFloat(quality);
        this.updateUISettings();
    }
    
    // Set FPS
    setFPS(fps) {
        this.settings.fps = parseInt(fps);
        this.updateUISettings();
        if (this.settings.isSharing) {
            this.restartCaptureIfNeeded();
        }
    }
    
    // Stop capture (alias for stopScreenCapture)
    stop() {
        this.stopScreenCapture();
    }
}

// At the end of screenCapture.js
export default ScreenCapture;