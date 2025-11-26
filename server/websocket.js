/**
 * WebSocket Server Module
 * Handles real-time communication for the chat application
 */

const WebSocket = require('ws');
const { saveMessage, getHistory } = require('./db');

// Store connected clients by room
const rooms = new Map();

// Store client info
const clients = new Map();

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        console.log('New WebSocket connection');
        
        // Generate unique client ID
        const clientId = generateClientId();
        
        // Store client info
        clients.set(ws, {
            id: clientId,
            roomId: null,
            userId: null,
            connectedAt: Date.now()
        });

        // Handle incoming messages
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await handleMessage(ws, message);
            } catch (error) {
                console.error('Error handling message:', error);
                sendError(ws, 'Invalid message format');
            }
        });

        // Handle client disconnect
        ws.on('close', () => {
            handleDisconnect(ws);
        });

        // Handle errors
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            handleDisconnect(ws);
        });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'system',
            content: '连接成功',
            timestamp: Date.now()
        }));
    });

    // Heartbeat to keep connections alive
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
    });

    console.log('WebSocket server initialized');
}

/**
 * Handle incoming messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message object
 */
async function handleMessage(ws, message) {
    const clientInfo = clients.get(ws);
    
    switch (message.type) {
        case 'join':
            await handleJoin(ws, message);
            break;
            
        case 'leave':
            await handleLeave(ws, message);
            break;
            
        case 'text':
        case 'audio':
        case 'video':
            await handleChatMessage(ws, message);
            break;
            
        case 'system':
            await handleSystemMessage(ws, message);
            break;
            
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
            
        default:
            console.warn('Unknown message type:', message.type);
    }
}

/**
 * Handle join room request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Join message
 */
async function handleJoin(ws, message) {
    const { roomId, senderId } = message;
    
    if (!roomId || !senderId) {
        sendError(ws, 'roomId and senderId are required');
        return;
    }
    
    const clientInfo = clients.get(ws);
    
    // Leave previous room if any
    if (clientInfo.roomId) {
        leaveRoom(ws, clientInfo.roomId);
    }
    
    // Update client info
    clientInfo.roomId = roomId;
    clientInfo.userId = senderId;
    
    // Add to room
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(ws);
    
    // Send join confirmation
    ws.send(JSON.stringify({
        type: 'joined',
        roomId: roomId,
        userId: senderId,
        timestamp: Date.now()
    }));
    
    // 发送历史记录给新加入的用户
    try {
        const history = await getHistory(roomId, 1, 50); // 获取最近50条
        if (history && history.length > 0) {
            ws.send(JSON.stringify({
                type: 'history',
                messages: history.reverse() // 按时间正序
            }));
        }
    } catch (e) {
        console.log('Failed to load history:', e.message);
    }
    
    // Broadcast join message to room (exclude self)
    const joinMessage = {
        type: 'system',
        roomId: roomId,
        senderId: 'system',
        timestamp: Date.now(),
        content: `${senderId} 加入了聊天室`
    };
    
    broadcastToRoom(roomId, joinMessage, ws);
    
    // Save to database
    await saveMessage(joinMessage);
    
    console.log(`User ${senderId} joined room ${roomId}`);
}

/**
 * Handle leave room request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Leave message
 */
async function handleLeave(ws, message) {
    const clientInfo = clients.get(ws);
    
    if (clientInfo.roomId) {
        const leaveMessage = {
            type: 'system',
            roomId: clientInfo.roomId,
            senderId: 'system',
            timestamp: Date.now(),
            content: `${clientInfo.userId} 离开了聊天室`
        };
        
        broadcastToRoom(clientInfo.roomId, leaveMessage, ws);
        await saveMessage(leaveMessage);
        
        leaveRoom(ws, clientInfo.roomId);
    }
}

/**
 * Handle chat messages (text, audio, video)
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Chat message
 */
async function handleChatMessage(ws, message) {
    const clientInfo = clients.get(ws);
    
    if (!clientInfo.roomId) {
        sendError(ws, 'Not in a room. Please join a room first.');
        return;
    }
    
    // Validate message
    if (!message.content) {
        sendError(ws, 'Message content is required');
        return;
    }
    
    // Normalize message
    const normalizedMessage = {
        type: message.type,
        roomId: clientInfo.roomId,
        senderId: clientInfo.userId || message.senderId,
        timestamp: message.timestamp || Date.now(),
        content: message.content,
        fileName: message.fileName,
        fileSize: message.size,
        duration: message.duration,
        thumbnail: message.thumbnail
    };
    
    // Save to database
    await saveMessage(normalizedMessage);
    
    // Broadcast to all clients in the room (including sender)
    broadcastToRoom(clientInfo.roomId, normalizedMessage);
    
    console.log(`Message from ${normalizedMessage.senderId} in room ${clientInfo.roomId}: ${message.type}`);
}

/**
 * Handle system messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - System message
 */
async function handleSystemMessage(ws, message) {
    const clientInfo = clients.get(ws);
    
    if (!clientInfo.roomId) {
        return;
    }
    
    const systemMessage = {
        type: 'system',
        roomId: clientInfo.roomId,
        senderId: 'system',
        timestamp: Date.now(),
        content: message.content
    };
    
    await saveMessage(systemMessage);
    broadcastToRoom(clientInfo.roomId, systemMessage);
}

/**
 * Handle client disconnect
 * @param {WebSocket} ws - WebSocket connection
 */
function handleDisconnect(ws) {
    const clientInfo = clients.get(ws);
    
    if (clientInfo) {
        if (clientInfo.roomId) {
            // Broadcast leave message
            const leaveMessage = {
                type: 'system',
                roomId: clientInfo.roomId,
                senderId: 'system',
                timestamp: Date.now(),
                content: `${clientInfo.userId || 'Unknown user'} 离开了聊天室`
            };
            
            broadcastToRoom(clientInfo.roomId, leaveMessage, ws);
            leaveRoom(ws, clientInfo.roomId);
        }
        
        clients.delete(ws);
        console.log('Client disconnected');
    }
}

/**
 * Leave a room
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} roomId - Room ID
 */
function leaveRoom(ws, roomId) {
    const room = rooms.get(roomId);
    if (room) {
        room.delete(ws);
        if (room.size === 0) {
            rooms.delete(roomId);
        }
    }
    
    const clientInfo = clients.get(ws);
    if (clientInfo) {
        clientInfo.roomId = null;
    }
}

/**
 * Broadcast message to all clients in a room
 * @param {string} roomId - Room ID
 * @param {Object} message - Message to broadcast
 * @param {WebSocket} exclude - Optional WebSocket to exclude
 */
function broadcastToRoom(roomId, message, exclude = null) {
    const room = rooms.get(roomId);
    if (!room) {
        console.log(`Room ${roomId} not found`);
        return;
    }
    
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    let idx = 0;
    
    room.forEach((client) => {
        idx++;
        const clientInfo = clients.get(client);
        const userId = clientInfo ? clientInfo.userId : 'unknown';
        const state = client.readyState;
        const isExcluded = client === exclude;
        
        console.log(`  [${idx}] ${userId}: state=${state}, excluded=${isExcluded}`);
        
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr);
                sentCount++;
                console.log(`    -> sent OK`);
            } catch (e) {
                console.log(`    -> send ERROR: ${e.message}`);
            }
        }
    });
    
    console.log(`Broadcast to ${sentCount}/${room.size} clients in room ${roomId}`);
}

/**
 * Send error message to client
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} error - Error message
 */
function sendError(ws, error) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'error',
            content: error,
            timestamp: Date.now()
        }));
    }
}

/**
 * Generate unique client ID
 * @returns {string} - Unique client ID
 */
function generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

/**
 * Get room statistics
 * @returns {Object} - Room statistics
 */
function getRoomStats() {
    const stats = {};
    rooms.forEach((clients, roomId) => {
        stats[roomId] = {
            clientCount: clients.size,
            clients: Array.from(clients).map(ws => {
                const info = clients.get(ws);
                return info ? info.userId : 'unknown';
            })
        };
    });
    return stats;
}

/**
 * Get total connected clients
 * @returns {number} - Total connected clients
 */
function getTotalClients() {
    return clients.size;
}

module.exports = {
    initWebSocket,
    getRoomStats,
    getTotalClients
};
