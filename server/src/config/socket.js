import { Server } from 'socket.io';

let io = null;
const clients = new Map();

const broadcastClientCount = () => {
    const clientCount = clients.size;
    console.log('📊 Broadcasting client count:', clientCount);
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
            console.log(`✅ ${data.type.toUpperCase()} identified: ${clientData.name} (socket: ${socket.id})`);            
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
            console.log('📥 Server received screen-data from lecturer:', data ? 'has data' : 'no data');
            if (data) {
                console.log('Frame details:', {
                    frameId: data.frameId,
                    size: data.size ? `${(data.size / 1024).toFixed(1)}KB` : 'unknown',
                    hasImage: !!data.image
                });
            }
            if (clientData.type === 'lecturer') {
                console.log('📤 Broadcasting screen-update to all students');
                // Send to all clients except the lecturer
                const targeted = [];
                for (const [clientId, client] of clients) {
                    if (client.type === 'student' && clientId !== socket.id) {
                        io.to(clientId).emit('screen-update', {
                            ...data,
                            senderId: socket.id,
                            timestamp: new Date().toISOString()
                        });
                        targeted.push(clientId);
                    }
                }

                if (targeted.length > 0) {
                    console.log(`✅ Broadcast completed to students: ${targeted.join(', ')}`);
                } else {
                    console.log('⚠️ No students found by type; falling back to broadcast to all other sockets');
                    // Fallback: broadcast to all other connected sockets (except sender)
                    socket.broadcast.emit('screen-update', {
                        ...data,
                        senderId: socket.id,
                        timestamp: new Date().toISOString()
                    });
                    console.log('✅ Fallback broadcast sent to all other sockets');
                }
            } else {
                console.log('⚠️ Non-lecturer client tried to send screen-data, type:', clientData.type);
            }
        });

        // Handle screen data from student
        socket.on('student-screen-data', (data) => {
            console.log('📥 Server received student-screen-data:', data ? 'has data' : 'no data');
            if (clientData.type === 'student') {
                console.log('📤 Broadcasting student-screen-update to lecturer');
                // Send to lecturer only
                for (const [clientId, client] of clients) {
                    if (client.type === 'lecturer') {
                        io.to(clientId).emit('student-screen-update', {
                            ...data,
                            studentId: socket.id,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
                console.log('✅ Student screen broadcast sent to lecturer');
            }
        });

        // Handle raised hand from student
        socket.on('student-raised-hand', (data) => {
            console.log('✋ Student raised hand:', data.name);
            for (const [clientId, client] of clients) {
                if (client.type === 'lecturer') {
                    io.to(clientId).emit('student-raised-hand', {
                        studentId: socket.id,
                        name: data.name,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });

        // Handle lowered hand from student
        socket.on('student-lowered-hand', () => {
            console.log('🙋 Student lowered hand');
            for (const [clientId, client] of clients) {
                if (client.type === 'lecturer') {
                    io.to(clientId).emit('student-lowered-hand', {
                        studentId: socket.id,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        });

        // Handle reaction from student
        socket.on('student-reaction', (data) => {
            console.log('😂 Student sent reaction:', data.emoji);
            for (const [clientId, client] of clients) {
                if (client.type === 'lecturer') {
                    io.to(clientId).emit('student-reaction', {
                        studentId: socket.id,
                        emoji: data.emoji,
                        timestamp: new Date().toISOString()
                    });
                }
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