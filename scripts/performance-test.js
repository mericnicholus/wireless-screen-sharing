/**
 * Performance Testing Script
 * Tests the screen sharing system with multiple simulated clients
 */

const io = require('socket.io-client');
const axios = require('axios');

class PerformanceTester {
    constructor(serverUrl, numClients = 10) {
        this.serverUrl = serverUrl;
        this.numClients = numClients;
        this.clients = [];
        this.metrics = {
            startTime: null,
            endTime: null,
            totalFrames: 0,
            totalData: 0,
            latencies: [],
            errors: 0
        };
    }
    
    async runTest(duration = 60000) { // 1 minute test
        console.log(`🚀 Starting performance test with ${this.numClients} clients`);
        console.log(`🔗 Server: ${this.serverUrl}`);
        console.log(`⏱️ Duration: ${duration / 1000} seconds`);
        console.log('=' .repeat(50));
        
        this.metrics.startTime = Date.now();
        
        // Create and connect clients
        await this.createClients();
        
        // Wait for test duration
        await new Promise(resolve => setTimeout(resolve, duration));
        
        // Cleanup
        await this.cleanup();
        
        this.metrics.endTime = Date.now();
        
        // Calculate results
        this.calculateResults();
        
        // Display results
        this.displayResults();
        
        return this.metrics;
    }
    
    async createClients() {
        const promises = [];
        
        for (let i = 0; i < this.numClients; i++) {
            promises.push(this.createClient(i));
            
            // Stagger connections to avoid overwhelming the server
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        await Promise.all(promises);
        console.log(`✅ All ${this.numClients} clients connected`);
    }
    
    async createClient(id) {
        return new Promise((resolve, reject) => {
            try {
                const client = io(this.serverUrl, {
                    reconnection: false,
                    timeout: 10000,
                    transports: ['websocket']
                });
                
                client.on('connect', () => {
                    // Identify as student
                    client.emit('identify', {
                        type: 'student',
                        name: `TestStudent_${id}`,
                        device: 'PerformanceTester'
                    });
                    
                    // Track frames received
                    client.on('screen-update', (data) => {
                        this.metrics.totalFrames++;
                        this.metrics.totalData += data.size || 0;
                        
                        // Calculate latency
                        const latency = Date.now() - data.timestamp;
                        this.metrics.latencies.push(latency);
                        
                        // Keep only last 1000 latencies
                        if (this.metrics.latencies.length > 1000) {
                            this.metrics.latencies.shift();
                        }
                    });
                    
                    // Track errors
                    client.on('error', (error) => {
                        console.error(`Client ${id} error:`, error);
                        this.metrics.errors++;
                    });
                    
                    this.clients.push(client);
                    resolve();
                });
                
                client.on('connect_error', (error) => {
                    console.error(`Client ${id} connection error:`, error);
                    this.metrics.errors++;
                    reject(error);
                });
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    if (!client.connected) {
                        client.disconnect();
                        reject(new Error(`Client ${id} connection timeout`));
                    }
                }, 5000);
                
            } catch (error) {
                console.error(`Failed to create client ${id}:`, error);
                this.metrics.errors++;
                reject(error);
            }
        });
    }
    
    async cleanup() {
        console.log('🧹 Cleaning up clients...');
        
        // Disconnect all clients
        for (const client of this.clients) {
            if (client.connected) {
                client.disconnect();
            }
        }
        
        this.clients = [];
        console.log('✅ Cleanup complete');
    }
    
    calculateResults() {
        const testDuration = (this.metrics.endTime - this.metrics.startTime) / 1000; // seconds
        
        // Calculate average latency
        if (this.metrics.latencies.length > 0) {
            const sum = this.metrics.latencies.reduce((a, b) => a + b, 0);
            this.metrics.avgLatency = sum / this.metrics.latencies.length;
            
            // Calculate 95th percentile latency
            const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
            const index = Math.floor(sorted.length * 0.95);
            this.metrics.p95Latency = sorted[index];
        }
        
        // Calculate frame rate
        this.metrics.avgFrameRate = this.metrics.totalFrames / testDuration;
        
        // Calculate data rate
        this.metrics.dataRate = this.metrics.totalData / testDuration; // bytes per second
        this.metrics.dataRateMbps = (this.metrics.dataRate * 8) / (1024 * 1024); // Mbps
        
        // Calculate success rate
        const totalConnections = this.numClients;
        const failedConnections = this.metrics.errors;
        this.metrics.successRate = ((totalConnections - failedConnections) / totalConnections) * 100;
    }
    
    displayResults() {
        console.log('\n' + '=' .repeat(50));
        console.log('📊 PERFORMANCE TEST RESULTS');
        console.log('=' .repeat(50));
        
        console.log(`Test Duration: ${((this.metrics.endTime - this.metrics.startTime) / 1000).toFixed(1)}s`);
        console.log(`Number of Clients: ${this.numClients}`);
        console.log(`Success Rate: ${this.metrics.successRate.toFixed(1)}%`);
        console.log(`Total Frames Received: ${this.metrics.totalFrames}`);
        console.log(`Total Data Received: ${this.formatBytes(this.metrics.totalData)}`);
        console.log('');
        console.log('📈 Performance Metrics:');
        console.log(`  Average Frame Rate: ${this.metrics.avgFrameRate.toFixed(1)} fps`);
        console.log(`  Average Latency: ${this.metrics.avgLatency ? this.metrics.avgLatency.toFixed(1) + 'ms' : 'N/A'}`);
        console.log(`  95th Percentile Latency: ${this.metrics.p95Latency ? this.metrics.p95Latency.toFixed(1) + 'ms' : 'N/A'}`);
        console.log(`  Data Rate: ${this.metrics.dataRateMbps ? this.metrics.dataRateMbps.toFixed(2) + ' Mbps' : 'N/A'}`);
        console.log('');
        console.log('🎯 Target Metrics:');
        console.log(`  Target Latency: < 500ms (${this.metrics.p95Latency ? (this.metrics.p95Latency <= 500 ? '✅ PASS' : '❌ FAIL') : 'N/A'})`);
        console.log(`  Target Frame Rate: > 5 fps (${this.metrics.avgFrameRate >= 5 ? '✅ PASS' : '❌ FAIL'})`);
        console.log(`  Target Success Rate: > 95% (${this.metrics.successRate >= 95 ? '✅ PASS' : '❌ FAIL'})`);
        console.log('=' .repeat(50));
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async testServerHealth() {
        try {
            console.log('🏥 Testing server health...');
            
            const response = await axios.get(`${this.serverUrl}/health`);
            console.log(`✅ Server health: ${response.data.status}`);
            
            const apiResponse = await axios.get(`${this.serverUrl}/api/status`);
            console.log(`✅ API status: ${apiResponse.data.status}`);
            console.log(`   Uptime: ${apiResponse.data.uptime.toFixed(1)}s`);
            console.log(`   Memory: ${this.formatBytes(apiResponse.data.memory.heapUsed)} used`);
            
            return true;
        } catch (error) {
            console.error('❌ Server health check failed:', error.message);
            return false;
        }
    }
}

// Run test if script is executed directly
if (require.main === module) {
    const serverUrl = process.argv[2] || 'http://localhost:3000';
    const numClients = parseInt(process.argv[3]) || 10;
    const duration = parseInt(process.argv[4]) || 30000; // 30 seconds
    
    const tester = new PerformanceTester(serverUrl, numClients);
    
    // Run health check first
    tester.testServerHealth().then(healthy => {
        if (healthy) {
            // Run performance test
            tester.runTest(duration).then(results => {
                console.log('\n✅ Performance test completed');
                process.exit(0);
            }).catch(error => {
                console.error('❌ Performance test failed:', error);
                process.exit(1);
            });
        } else {
            console.error('❌ Server is not healthy, aborting test');
            process.exit(1);
        }
    });
}

module.exports = PerformanceTester;