-- SQLite Database Schema for Lynx Chat Application

-- Drop existing tables if they exist
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;

-- Create users table (optional, for user management)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    username TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create rooms table (optional, for room management)
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

-- Create messages table (main table)
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('text', 'audio', 'video', 'system')),
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    content TEXT NOT NULL,
    file_name TEXT,
    file_size INTEGER,
    duration INTEGER,
    thumbnail TEXT,
    mime_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_room_timestamp ON messages(room_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);

-- Create index for full-text search on content (text messages only)
-- Note: SQLite FTS5 can be used for more advanced full-text search

-- Insert default room
INSERT OR IGNORE INTO rooms (room_id, name, description)
VALUES ('default_room', '默认房间', '欢迎来到默认聊天室');

-- Sample system message
INSERT INTO messages (type, room_id, sender_id, timestamp, content)
VALUES ('system', 'default_room', 'system', strftime('%s', 'now') * 1000, '欢迎来到 Lynx Chat！');
