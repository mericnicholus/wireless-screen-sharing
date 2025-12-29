import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import socketServer from './config/socket.js';
import config from './config/server.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = config.port || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from the client directory
app.use(express.static(join(__dirname, '../../client')));

// Routes
app.get('/', (req, res) => {
  res.redirect('/lecturer');
});

app.get('/lecturer', (req, res) => {
  res.sendFile(join(__dirname, '../../client/lecturer/index.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(join(__dirname, '../../client/student/index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketServer.init(server);

// Store io instance globally for use in controllers
global.io = io;

// Start server
server.listen(PORT, config.host, () => {
  console.log(`🎯 Server running on http://${config.host}:${PORT}`);
  console.log(`📡 Access points:`);
  console.log(`   Lecturer: http://${config.host}:${PORT}/lecturer`);
  console.log(`   Student:  http://${config.host}:${PORT}/student`);
  console.log(`📶 Network: ${config.networkInfo.ssid}`);
  console.log(`👥 Max clients: ${config.networkInfo.maxClients}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});