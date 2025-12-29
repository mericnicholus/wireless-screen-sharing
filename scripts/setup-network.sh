#!/bin/bash

# Wireless Screen Sharing System - Network Setup Script
# For TP-Link TL-WR902AC Router Configuration

echo "========================================"
echo "MUST Wireless Screen Sharing System Setup"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Configuration
SSID="MUST-Lecture-Sharing"
PASSWORD="must2024"
CHANNEL=6
MODE="ap"
IP_ADDRESS="192.168.0.1"
SUBNET="255.255.255.0"
DHCP_START="192.168.0.100"
DHCP_END="192.168.0.200"
LEASE_TIME="24h"

echo "Configuring wireless network..."
echo "SSID: $SSID"
echo "IP Range: $DHCP_START - $DHCP_END"
echo ""

# Install required packages (for Ubuntu/Debian)
echo "Installing required packages..."
apt-get update
apt-get install -y hostapd dnsmasq iptables

echo "Stopping services..."
systemctl stop hostapd
systemctl stop dnsmasq

# Configure hostapd
echo "Configuring hostapd..."
cat > /etc/hostapd/hostapd.conf << EOF
interface=wlan0
driver=nl80211
ssid=$SSID
hw_mode=g
channel=$CHANNEL
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$PASSWORD
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

# Configure dnsmasq
echo "Configuring dnsmasq..."
cat > /etc/dnsmasq.conf << EOF
interface=wlan0
dhcp-range=$DHCP_START,$DHCP_END,$SUBNET,$LEASE_TIME
dhcp-option=3,$IP_ADDRESS
dhcp-option=6,$IP_ADDRESS
server=8.8.8.8
log-queries
log-dhcp
EOF

# Configure network interfaces
echo "Configuring network interfaces..."
cat > /etc/network/interfaces.d/wlan0 << EOF
auto wlan0
iface wlan0 inet static
    address $IP_ADDRESS
    netmask $SUBNET
    wireless-mode $MODE
EOF

# Enable IP forwarding
echo "Enabling IP forwarding..."
echo 1 > /proc/sys/net/ipv4/ip_forward

# Configure iptables for NAT
echo "Configuring iptables..."
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT

# Save iptables rules
iptables-save > /etc/iptables.rules

# Create iptables restore script
cat > /etc/network/if-pre-up.d/iptables << EOF
#!/bin/bash
iptables-restore < /etc/iptables.rules
EOF

chmod +x /etc/network/if-pre-up.d/iptables

# Start services
echo "Starting services..."
systemctl unmask hostapd
systemctl enable hostapd
systemctl enable dnsmasq

systemctl start hostapd
systemctl start dnsmasq

echo ""
echo "========================================"
echo "Setup complete!"
echo "========================================"
echo ""
echo "Wireless Network: $SSID"
echo "Password: $PASSWORD"
echo "Server IP: $IP_ADDRESS"
echo "Client IP Range: $DHCP_START - $DHCP_END"
echo ""
echo "Connect your devices to the WiFi network"
echo "Access the system at: http://$IP_ADDRESS:3000"
echo ""