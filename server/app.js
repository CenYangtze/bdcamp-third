/**
 * Node.js Chat Server
 * Main entry point for the hybrid chat application server
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { initWebSocket } = require('./websocket');
const { initDatabase, saveMessage, getHistory } = require('./db');

const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3003;
const HOST = '0.0.0.0'; // 监听所有网络接口
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = file.mimetype.startsWith('audio/') ? 'audio' : 'video';
        const typeDir = path.join(UPLOADS_DIR, type);
        
        if (!fs.existsSync(typeDir)) {
            fs.mkdirSync(typeDir, { recursive: true });
        }
        
        cb(null, typeDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept audio and video files
        if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio and video files are allowed'), false);
        }
    }
});

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(UPLOADS_DIR));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});

// ============ HTTP 轮询方案（备用） ============
// 内存中存储最近的消息
const recentMessages = [];
const MAX_MESSAGES = 100;

// 发送消息 API
app.post('/api/send', async (req, res) => {
    const { senderId, content, type = 'text' } = req.body;
    
    if (!senderId || !content) {
        return res.status(400).json({ error: 'senderId and content required' });
    }
    
    const message = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        type,
        senderId,
        content,
        roomId: 'default_room',
        timestamp: Date.now()
    };
    
    recentMessages.push(message);
    if (recentMessages.length > MAX_MESSAGES) {
        recentMessages.shift();
    }
    
    // 同时保存到数据库
    try {
        await saveMessage(message);
    } catch (e) {
        console.log('DB save error:', e.message);
    }
    
    console.log(`[HTTP] Message from ${senderId}: ${content}`);
    res.json({ success: true, message });
});

// 获取消息 API（轮询）
app.get('/api/messages', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const messages = recentMessages.filter(m => m.timestamp > since);
    res.json({ messages });
});

// 获取历史记录 API
app.get('/api/history', async (req, res) => {
    try {
        const roomId = req.query.roomId || 'default_room';
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 50;
        
        const messages = await getHistory(roomId, page, size);
        res.json({ 
            success: true, 
            messages: messages.reverse() // 按时间正序返回
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 加入聊天室通知
app.post('/api/join', async (req, res) => {
    const { senderId } = req.body;
    
    if (!senderId) {
        return res.status(400).json({ error: 'senderId required' });
    }
    
    const message = {
        id: Date.now() + '_sys',
        type: 'system',
        senderId: 'system',
        roomId: 'default_room',
        content: `${senderId} 加入了聊天室`,
        timestamp: Date.now()
    };
    
    recentMessages.push(message);
    
    // 保存到数据库
    try {
        await saveMessage(message);
    } catch (e) {
        console.log('DB save error:', e.message);
    }
    
    console.log(`[HTTP] ${senderId} joined`);
    res.json({ success: true });
});
// ============ HTTP 轮询方案结束 ============

// Get chat history
app.get('/history', async (req, res) => {
    try {
        const { roomId, page = 1, size = 20 } = req.query;
        
        if (!roomId) {
            return res.status(400).json({
                success: false,
                error: 'roomId is required'
            });
        }
        
        const pageNum = parseInt(page, 10);
        const pageSize = parseInt(size, 10);
        
        if (isNaN(pageNum) || pageNum < 1) {
            return res.status(400).json({
                success: false,
                error: 'Invalid page number'
            });
        }
        
        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
            return res.status(400).json({
                success: false,
                error: 'Invalid page size (1-100)'
            });
        }
        
        const messages = await getHistory(roomId, pageNum, pageSize);
        
        res.json({
            success: true,
            messages: messages,
            page: pageNum,
            size: pageSize,
            hasMore: messages.length === pageSize
        });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Upload media file
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }
        
        const { roomId, senderId, type } = req.body;
        
        if (!roomId || !senderId) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'roomId and senderId are required'
            });
        }
        
        const fileUrl = `/uploads/${type || 'media'}/${req.file.filename}`;
        
        // Save message to database
        const message = {
            type: type || (req.file.mimetype.startsWith('audio/') ? 'audio' : 'video'),
            roomId: roomId,
            senderId: senderId,
            timestamp: Date.now(),
            content: fileUrl,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype
        };
        
        await saveMessage(message);
        
        res.json({
            success: true,
            filePath: fileUrl,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload file'
        });
    }
});

// Get room list
app.get('/rooms', async (req, res) => {
    try {
        // In a real app, you'd query this from the database
        res.json({
            success: true,
            rooms: [
                { id: 'default_room', name: '默认房间', members: 0 }
            ]
        });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File size exceeds limit (100MB)'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not found'
    });
});

// Initialize and start server
async function startServer() {
    try {
        // Initialize database
        await initDatabase();
        console.log('✓ Database initialized');
        
        // Initialize WebSocket server
        initWebSocket(server);
        console.log('✓ WebSocket server initialized');
        
        // Start HTTP server
        server.listen(PORT, HOST, () => {
            console.log(`✓ Server running on http://${HOST}:${PORT}`);
            console.log(`  - HTTP API: http://0.0.0.0:${PORT}`);
            console.log(`  - WebSocket: ws://0.0.0.0:${PORT}`);
            console.log(`  - Uploads: http://0.0.0.0:${PORT}/uploads`);
            console.log(`  - 手机访问: http://10.107.230.250:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Start the server
startServer();

module.exports = { app, server };
