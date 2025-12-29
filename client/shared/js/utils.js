/**
 * Shared utility functions for both lecturer and student applications
 */

class Utils {
    /**
     * Format bytes to human readable format
     * @param {number} bytes - Bytes to format
     * @param {number} decimals - Decimal places
     * @returns {string} Formatted string
     */
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    /**
     * Format time in milliseconds to human readable format
     * @param {number} ms - Milliseconds
     * @returns {string} Formatted string
     */
    static formatTime(ms) {
        if (ms < 1000) return ms + 'ms';
        if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
        if (ms < 3600000) return (ms / 60000).toFixed(1) + 'min';
        return (ms / 3600000).toFixed(1) + 'hr';
    }
    
    /**
     * Debounce function to limit how often a function can be called
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    /**
     * Throttle function to limit function execution rate
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    /**
     * Get current timestamp in ISO format
     * @returns {string} ISO timestamp
     */
    static getTimestamp() {
        return new Date().toISOString();
    }
    
    /**
     * Generate a unique ID
     * @param {number} length - Length of the ID
     * @returns {string} Unique ID
     */
    static generateId(length = 8) {
        return Math.random().toString(36).substr(2, length);
    }
    
    /**
     * Check if running on mobile device
     * @returns {boolean} True if mobile
     */
    static isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    /**
     * Check if running on iOS
     * @returns {boolean} True if iOS
     */
    static isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }
    
    /**
     * Check if browser supports WebRTC
     * @returns {boolean} True if WebRTC is supported
     */
    static supportsWebRTC() {
        return !!(
            navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia &&
            window.RTCPeerConnection
        );
    }
    
    /**
     * Check if browser supports WebSocket
     * @returns {boolean} True if WebSocket is supported
     */
    static supportsWebSocket() {
        return 'WebSocket' in window || 'MozWebSocket' in window;
    }
    
    /**
     * Get browser name and version
     * @returns {Object} Browser info
     */
    static getBrowserInfo() {
        const ua = navigator.userAgent;
        let tem, M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
        
        if (/trident/i.test(M[1])) {
            tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
            return { name: 'IE', version: (tem[1] || '') };
        }
        
        if (M[1] === 'Chrome') {
            tem = ua.match(/\bOPR\/(\d+)/);
            if (tem != null) {
                return { name: 'Opera', version: tem[1] };
            }
        }
        
        M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
        if ((tem = ua.match(/version\/(\d+)/i)) != null) {
            M.splice(1, 1, tem[1]);
        }
        
        return {
            name: M[0],
            version: M[1]
        };
    }
    
    /**
     * Get device pixel ratio
     * @returns {number} Device pixel ratio
     */
    static getPixelRatio() {
        return window.devicePixelRatio || 1;
    }
    
    /**
     * Get network connection info
     * @returns {Promise<Object>} Connection info
     */
    static async getNetworkInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
        if (connection) {
            return {
                downlink: connection.downlink,
                effectiveType: connection.effectiveType,
                rtt: connection.rtt,
                saveData: connection.saveData,
                type: connection.type
            };
        }
        
        return null;
    }
    
    /**
     * Get local IP address using WebRTC
     * @returns {Promise<string>} Local IP address
     */
    static async getLocalIP() {
        return new Promise((resolve) => {
            const RTCPeerConnection = window.RTCPeerConnection || 
                                    window.mozRTCPeerConnection || 
                                    window.webkitRTCPeerConnection;
            
            if (!RTCPeerConnection) {
                resolve('Unknown');
                return;
            }
            
            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel('');
            pc.createOffer().then(pc.setLocalDescription.bind(pc));
            
            pc.onicecandidate = (ice) => {
                if (ice && ice.candidate && ice.candidate.candidate) {
                    const match = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ice.candidate.candidate);
                    if (match) {
                        const ip = match[1];
                        pc.onicecandidate = () => {};
                        pc.close();
                        resolve(ip);
                        return;
                    }
                }
            };
            
            setTimeout(() => {
                pc.onicecandidate = () => {};
                pc.close();
                resolve('Unknown');
            }, 2000);
        });
    }
    
    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Success status
     */
    static async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
                return true;
            }
        } catch (error) {
            console.error('Failed to copy text:', error);
            return false;
        }
    }
    
    /**
     * Create and show a notification
     * @param {string} title - Notification title
     * @param {Object} options - Notification options
     * @returns {Notification} Notification object
     */
    static showNotification(title, options = {}) {
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return null;
        }
        
        if (Notification.permission === 'granted') {
            return new Notification(title, options);
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    return new Notification(title, options);
                }
            });
        }
        
        return null;
    }
    
    /**
     * Vibrate device (if supported)
     * @param {number|Array} pattern - Vibration pattern
     * @returns {boolean} Success status
     */
    static vibrate(pattern = 200) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
            return true;
        }
        return false;
    }
    
    /**
     * Measure page load performance
     * @returns {Object} Performance metrics
     */
    static getPerformanceMetrics() {
        if (!window.performance || !window.performance.timing) {
            return null;
        }
        
        const timing = window.performance.timing;
        const metrics = {};
        
        metrics.dns = timing.domainLookupEnd - timing.domainLookupStart;
        metrics.tcp = timing.connectEnd - timing.connectStart;
        metrics.request = timing.responseStart - timing.requestStart;
        metrics.response = timing.responseEnd - timing.responseStart;
        metrics.domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
        metrics.load = timing.loadEventEnd - timing.navigationStart;
        
        return metrics;
    }
    
    /**
     * Log performance data
     * @param {string} label - Log label
     * @param {any} data - Data to log
     */
    static logPerformance(label, data) {
        if (console && console.timeStamp) {
            console.timeStamp(label);
        }
        
        if (data !== undefined) {
            console.log(`[Performance] ${label}:`, data);
        } else {
            console.log(`[Performance] ${label}`);
        }
    }
    
    /**
     * Create a data URL from blob
     * @param {Blob} blob - Blob to convert
     * @returns {Promise<string>} Data URL
     */
    static blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    /**
     * Create a blob from data URL
     * @param {string} dataURL - Data URL to convert
     * @returns {Blob} Blob object
     */
    static dataURLToBlob(dataURL) {
        const parts = dataURL.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        
        return new Blob([uInt8Array], { type: contentType });
    }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}