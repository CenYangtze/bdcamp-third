/**
 * Database Module
 * SQLite database operations for the chat application
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'chat.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

/**
 * Initialize the database
 * @returns {Promise<void>}
 */
function initDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Failed to connect to database:', err);
                reject(err);
                return;
            }
            
            console.log('Connected to SQLite database');
            
            // Read and execute schema
            const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
            
            db.exec(schema, (err) => {
                if (err) {
                    console.error('Failed to initialize schema:', err);
                    reject(err);
                    return;
                }
                
                console.log('Database schema initialized');
                resolve();
            });
        });
        
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
    });
}

/**
 * Save a message to the database
 * @param {Object} message - Message object to save
 * @returns {Promise<number>} - ID of the inserted message
 */
function saveMessage(message) {
    return new Promise((resolve, reject) => {
        const {
            type,
            roomId,
            senderId,
            timestamp,
            content,
            fileName = null,
            fileSize = null,
            duration = null,
            thumbnail = null,
            mimeType = null
        } = message;
        
        const sql = `
            INSERT INTO messages (type, room_id, sender_id, timestamp, content, file_name, file_size, duration, thumbnail, mime_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [type, roomId, senderId, timestamp, content, fileName, fileSize, duration, thumbnail, mimeType];
        
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Failed to save message:', err);
                reject(err);
                return;
            }
            
            resolve(this.lastID);
        });
    });
}

/**
 * Get chat history for a room
 * @param {string} roomId - Room ID
 * @param {number} page - Page number (1-based)
 * @param {number} size - Number of messages per page
 * @returns {Promise<Array>} - Array of messages
 */
function getHistory(roomId, page = 1, size = 20) {
    return new Promise((resolve, reject) => {
        const offset = (page - 1) * size;
        
        const sql = `
            SELECT 
                id,
                type,
                room_id as roomId,
                sender_id as senderId,
                timestamp,
                content,
                file_name as fileName,
                file_size as fileSize,
                duration,
                thumbnail,
                mime_type as mimeType,
                created_at as createdAt
            FROM messages
            WHERE room_id = ?
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        `;
        
        db.all(sql, [roomId, size, offset], (err, rows) => {
            if (err) {
                console.error('Failed to get history:', err);
                reject(err);
                return;
            }
            
            resolve(rows || []);
        });
    });
}

/**
 * Get message by ID
 * @param {number} messageId - Message ID
 * @returns {Promise<Object>} - Message object
 */
function getMessageById(messageId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                id,
                type,
                room_id as roomId,
                sender_id as senderId,
                timestamp,
                content,
                file_name as fileName,
                file_size as fileSize,
                duration,
                thumbnail,
                mime_type as mimeType,
                created_at as createdAt
            FROM messages
            WHERE id = ?
        `;
        
        db.get(sql, [messageId], (err, row) => {
            if (err) {
                console.error('Failed to get message:', err);
                reject(err);
                return;
            }
            
            resolve(row);
        });
    });
}

/**
 * Delete a message by ID
 * @param {number} messageId - Message ID
 * @returns {Promise<boolean>} - True if deleted
 */
function deleteMessage(messageId) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM messages WHERE id = ?';
        
        db.run(sql, [messageId], function(err) {
            if (err) {
                console.error('Failed to delete message:', err);
                reject(err);
                return;
            }
            
            resolve(this.changes > 0);
        });
    });
}

/**
 * Get all rooms with message counts
 * @returns {Promise<Array>} - Array of room objects
 */
function getRooms() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                room_id as id,
                COUNT(*) as messageCount,
                MAX(timestamp) as lastActivity
            FROM messages
            GROUP BY room_id
            ORDER BY lastActivity DESC
        `;
        
        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('Failed to get rooms:', err);
                reject(err);
                return;
            }
            
            resolve(rows || []);
        });
    });
}

/**
 * Delete all messages in a room
 * @param {string} roomId - Room ID
 * @returns {Promise<number>} - Number of deleted messages
 */
function clearRoom(roomId) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM messages WHERE room_id = ?';
        
        db.run(sql, [roomId], function(err) {
            if (err) {
                console.error('Failed to clear room:', err);
                reject(err);
                return;
            }
            
            resolve(this.changes);
        });
    });
}

/**
 * Get messages by sender
 * @param {string} senderId - Sender ID
 * @param {number} limit - Maximum number of messages
 * @returns {Promise<Array>} - Array of messages
 */
function getMessagesBySender(senderId, limit = 100) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                id,
                type,
                room_id as roomId,
                sender_id as senderId,
                timestamp,
                content,
                file_name as fileName,
                file_size as fileSize,
                duration,
                thumbnail,
                mime_type as mimeType,
                created_at as createdAt
            FROM messages
            WHERE sender_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `;
        
        db.all(sql, [senderId, limit], (err, rows) => {
            if (err) {
                console.error('Failed to get messages by sender:', err);
                reject(err);
                return;
            }
            
            resolve(rows || []);
        });
    });
}

/**
 * Search messages by content
 * @param {string} query - Search query
 * @param {string} roomId - Optional room ID filter
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} - Array of matching messages
 */
function searchMessages(query, roomId = null, limit = 50) {
    return new Promise((resolve, reject) => {
        let sql = `
            SELECT 
                id,
                type,
                room_id as roomId,
                sender_id as senderId,
                timestamp,
                content,
                file_name as fileName,
                file_size as fileSize,
                duration,
                thumbnail,
                mime_type as mimeType,
                created_at as createdAt
            FROM messages
            WHERE type = 'text' AND content LIKE ?
        `;
        
        const params = [`%${query}%`];
        
        if (roomId) {
            sql += ' AND room_id = ?';
            params.push(roomId);
        }
        
        sql += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Failed to search messages:', err);
                reject(err);
                return;
            }
            
            resolve(rows || []);
        });
    });
}

/**
 * Get database statistics
 * @returns {Promise<Object>} - Database statistics
 */
function getStats() {
    return new Promise((resolve, reject) => {
        const stats = {};
        
        db.serialize(() => {
            db.get('SELECT COUNT(*) as total FROM messages', [], (err, row) => {
                if (err) return reject(err);
                stats.totalMessages = row.total;
            });
            
            db.get('SELECT COUNT(DISTINCT room_id) as total FROM messages', [], (err, row) => {
                if (err) return reject(err);
                stats.totalRooms = row.total;
            });
            
            db.get('SELECT COUNT(DISTINCT sender_id) as total FROM messages', [], (err, row) => {
                if (err) return reject(err);
                stats.totalUsers = row.total;
            });
            
            db.get(`
                SELECT 
                    SUM(CASE WHEN type = 'text' THEN 1 ELSE 0 END) as textCount,
                    SUM(CASE WHEN type = 'audio' THEN 1 ELSE 0 END) as audioCount,
                    SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videoCount,
                    SUM(CASE WHEN type = 'system' THEN 1 ELSE 0 END) as systemCount
                FROM messages
            `, [], (err, row) => {
                if (err) return reject(err);
                stats.messageTypes = row;
                resolve(stats);
            });
        });
    });
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
function closeDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log('Database connection closed');
                resolve();
            });
        } else {
            resolve();
        }
    });
}

module.exports = {
    initDatabase,
    saveMessage,
    getHistory,
    getMessageById,
    deleteMessage,
    getRooms,
    clearRoom,
    getMessagesBySender,
    searchMessages,
    getStats,
    closeDatabase
};
