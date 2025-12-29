import dotenv from 'dotenv';

dotenv.config();

export default {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  
  networkInfo: {
    ssid: 'MUST-Lecture-Sharing',
    ipRange: '192.168.0.100-192.168.0.200',
    maxClients: 40,
    sessionTimeout: 3600000,
    broadcastInterval: 1000
  }
};