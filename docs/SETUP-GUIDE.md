# Wireless Screen Sharing System - Setup Guide

## Hardware Requirements

### Essential Components:
1. **Router/Access Point**: TP-Link TL-WR902AC or similar
   - AC750 Wireless Travel Router
   - Supports up to 40 concurrent devices
   - Powered via USB (5V/2A)
   
2. **Power Supply**:
   - Power bank: 20,000 mAh or larger
   - USB cable (Type-A to Micro-USB)
   
3. **Server Device**:
   - Laptop or mini-PC (Windows/macOS/Linux)
   - Minimum: 4GB RAM, dual-core processor
   - Ethernet port (recommended) or WiFi adapter

4. **Client Devices**:
   - Student laptops, tablets, or smartphones
   - Modern web browser (Chrome 80+, Firefox 75+, Safari 13+)

## Network Configuration

### Option A: Using TP-Link Router

1. **Connect Hardware**:

Power Bank → USB Cable → TP-Link Router → Ethernet Cable → Server Laptop

2. **Configure Router**:
- Connect to router's default WiFi (check router label)
- Open browser to `192.168.0.1`
- Login: admin/admin (default)

3. **Wireless Settings**:

Operation Mode: Access Point
SSID: MUST-Lecture-Sharing
Password: [choose secure password]
Channel: 6 (least interference)
Max Clients: 40

4. **Network Settings**:

IP Address: 192.168.0.1
Subnet Mask: 255.255.255.0
DHCP: Enabled
Start IP: 192.168.0.100
End IP: 192.168.0.200
Lease Time: 24 hours


### Option B: Using Raspberry Pi as Access Point

See `scripts/setup-network.sh` for automated setup.

## Software Installation

### 1. Prerequisites
```bash
# Install Node.js (version 16 or higher)
# Download from https://nodejs.org/
# Verify installation:
node --version  # Should show v16.x or higher
npm --version   # Should show 8.x or higher


### PRoject set up

# Clone or extract the project
cd wireless-screen-sharing

# Install server dependencies
cd server
npm install

# For development with auto-restart
npm install -g nodemon

### RUNNING THE SYSTEM
## start server
cd server
npm start
# Or for development: npm run dev

Access Interfaces:
Lecturer: http://<server-ip>:3000/lecturer

Student: http://<server-ip>:3000/student

Status: http://<server-ip>:3000/health

Windows Users:
Run scripts/start-server.bat from the server directory.

Usage Instructions
For Lecturers:
Connect laptop to MUST-Lecture-Sharing WiFi

Open browser to lecturer URL

Click "Start Sharing Screen"

Select screen/window to share

Students will automatically receive screen updates

For Students:
Connect to MUST-Lecture-Sharing WiFi

Open browser to student URL

Screen will automatically update when lecturer shares

Use fullscreen button for better visibility

Testing
Performance Test:
cd scripts
node performance-test.js http://localhost:3000 20 60000
# Tests with 20 clients for 60 seconds

Manual Testing Checklist:
Server starts without errors

Lecturer interface loads

Student interface loads

Screen sharing works

Multiple students can connect

Frame rate is acceptable (>5 FPS)

Latency is low (<500ms)

Battery life sufficient (2+ hours)

Troubleshooting
Common Issues:
Server won't start:

Check Node.js version: node --version

Check port 3000 is not in use

Check firewall settings

Clients can't connect:

Verify WiFi connection

Check server IP address

Ensure all devices on same network

Screen sharing not working:

Check browser permissions

Try different browser (Chrome recommended)

Reduce screen resolution

High latency:

Reduce frame rate (3-5 FPS for slides)

Lower image quality (70% is usually sufficient)

Limit number of connected clients

Battery drains quickly:

Use larger capacity power bank

Disable router features not needed

Reduce screen brightness on server

Performance Optimization
For Large Classes (40+ students):
Set frame rate to 3 FPS

Reduce image quality to 60%

Use wired connection for server

Close unnecessary applications

For Better Quality:
Set frame rate to 10-15 FPS

Use 80-90% image quality

Limit to 20 concurrent clients

Ensure good WiFi signal

Security Considerations
Network Security:

Change default router password

Use WPA2 encryption

Regular firmware updates

Application Security:

Local network only (no internet exposure)

No personal data collection

Session-based connections

Privacy:

Only shares what lecturer explicitly selects

Students see only screen content

No recording or storage of content

Maintenance
Regular Checks:
Battery level of power bank

Router firmware updates

Server software updates

Network performance monitoring

Backup Configuration:
Save router configuration file

Backup server code and settings

Document network settings



## **6. Final Steps**

Create the project structure and run it:

```bash
# Create all the files using the provided content
# (You'll need to copy each file's content into its respective location)

# Navigate to server directory and install dependencies
cd wireless-screen-sharing/server
npm install

# Start the server
npm start

# Or for development with auto-restart
npm run dev