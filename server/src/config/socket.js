import { Server } from 'socket.io';

let io = null;
const clients = new Map();

const broadcastClientCount = () => {
    const clientCount = clients.size;
    io.emit('client-count', { count: clientCount });
};

const broadcastLecturerStatus = () => {
    const lecturer = Array.from(clients.values()).find(client => client.type === 'lecturer');
    io.emit('lecturer-status', { 
        isOnline: !!lecturer,
        lecturer: lecturer ? { id: lecturer.id, name: lecturer.name } : null
    });
};

const setupSocketHandlers = () => {
    io.on('connection', (socket) => {
        console.log(`📱 New client connected: ${socket.id}`);
        
        // Initialize client data
        const clientData = {
            id: socket.id,
            type: 'unknown',
            name: 'Anonymous',
            connectedAt: new Date(),
            lastActivity: new Date(),
            ip: socket.handshake.address
        };
        
        clients.set(socket.id, clientData);
        
        // Send current lecturer status
        broadcastLecturerStatus();
        
        // Client identifies itself
        socket.on('identify', (data) => {
            clientData.type = data.type;
            clientData.name = data.name || clientData.name;
            clientData.lastActivity = new Date();
            console.log(`✅ ${data.type.toUpperCase()} identified: ${clientData.name}`);
            
            if (data.type === 'lecturer') {
                console.log('Broadcasting lecturer-connected event');
                // Notify all clients about lecturer connection
                io.emit('lecturer-connected', { 
                    id: socket.id, 
                    name: clientData.name,
                    timestamp: new Date().toISOString()
                });
                console.log('Finished broadcasting lecturer-connected event');
            }
            
            // Update client count
            console.log('Broadcasting client count');
            broadcastClientCount();
            console.log('Finished broadcasting client count');
        });

        // Handle screen data from lecturer
        socket.on('screen-data', (data) => {
            if (clientData.type === 'lecturer') {
                // Broadcast to all clients except the sender
                socket.broadcast.emit('screen-update', {
                    ...data,
                    senderId: socket.id,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log(`❌ Client disconnected: ${socket.id} (${reason})`);
            const wasLecturer = clientData.type === 'lecturer';
            clients.delete(socket.id);
            
            if (wasLecturer) {
                console.log('Broadcasting lecturer status');
                broadcastLecturerStatus();
                console.log('Finished broadcasting lecturer status');
                io.emit('lecturer-disconnected', {
                    id: socket.id,
                    name: clientData.name,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log('Broadcasting client count');
            broadcastClientCount();
            console.log('Finished broadcasting client count');
        });

        // Keep-alive ping
        socket.on('ping', () => {
            clientData.lastActivity = new Date();
            socket.emit('pong');
        });
    });
};

export default {
    init: (server) => {
        if (io) {
            return io; // Return existing instance if already initialized
        }

        io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling'],
            maxHttpBufferSize: 1e8 // 100MB for large images
        });
        
        setupSocketHandlers();
        return io;
    },
    
    getIO: () => {
        if (!io) {
            throw new Error('Socket.io not initialized');
        }
        return io;
    },
    
    getClientCount: () => clients.size,
    
    getClients: () => Array.from(clients.values()),
    
    getClient: (clientId) => clients.get(clientId),
    
    isLecturerOnline: () => {
        return Array.from(clients.values()).some(client => client.type === 'lecturer');
    }
};