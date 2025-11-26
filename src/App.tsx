import { useState, useEffect } from '@lynx-js/react'
import './App.css'

// 服务器配置
const SERVER_IP = '10.107.230.250'
const SERVER_PORT = '3003'
const API_BASE = `http://${SERVER_IP}:${SERVER_PORT}`

// 生成用户ID
const MY_USER_ID = 'User_' + Math.random().toString(36).substr(2, 4)

// 消息类型定义
interface Message {
  id: string
  type: 'text' | 'audio' | 'video' | 'system'
  senderId: string
  content: string
  fileName?: string
  fileSize?: number
  duration?: number
  time: string
  timestamp: number
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 格式化时长
const formatDuration = (seconds: number): string => {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [status, setStatus] = useState('连接中...')
  const [lastTimestamp, setLastTimestamp] = useState(0)
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [showMediaPicker, setShowMediaPicker] = useState(false)

  // 获取时间字符串
  const getTime = (ts?: number) => {
    const d = ts ? new Date(ts) : new Date()
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
  }

  // 加载历史记录
  const loadHistory = (pageNum: number = 1, prepend: boolean = false) => {
    if (loading) return
    setLoading(true)
    
    fetch(`${API_BASE}/api/history?roomId=default_room&page=${pageNum}&size=20`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.messages) {
          const historyMsgs: Message[] = data.messages.map((m: any, i: number) => ({
            id: 'h_' + m.timestamp + '_' + i,
            type: m.type,
            senderId: m.senderId,
            content: m.content,
            fileName: m.fileName,
            fileSize: m.fileSize,
            duration: m.duration,
            time: getTime(m.timestamp),
            timestamp: m.timestamp
          }))
          
          if (prepend) {
            setMessages(prev => [...historyMsgs, ...prev])
          } else {
            setMessages(historyMsgs)
            if (historyMsgs.length > 0) {
              setLastTimestamp(Math.max(...historyMsgs.map(m => m.timestamp)))
            }
          }
          
          setHasMore(data.messages.length === 20)
          setPage(pageNum)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // 加载更多历史
  const loadMore = () => {
    if (hasMore && !loading) {
      loadHistory(page + 1, true)
    }
  }

  // 初始化：加入聊天室 + 获取历史记录
  useEffect(() => {
    // 获取历史记录
    loadHistory(1, false)
    
    // 加入聊天室
    fetch(`${API_BASE}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: MY_USER_ID })
    })
    .then(res => res.json())
    .then(() => {
      setStatus('在线')
      setJoined(true)
      if (lastTimestamp === 0) {
        setLastTimestamp(Date.now())
      }
    })
    .catch(() => {
      setStatus('连接失败')
    })
  }, [])

  // 轮询获取新消息
  useEffect(() => {
    if (!joined) return

    const poll = () => {
      fetch(`${API_BASE}/api/messages?since=${lastTimestamp}`)
        .then(res => res.json())
        .then(data => {
          if (data.messages && data.messages.length > 0) {
            const newMsgs = data.messages
              .filter((m: any) => !(m.type !== 'system' && m.senderId === MY_USER_ID))
              .map((m: any) => ({
                id: m.id || 'p_' + m.timestamp + Math.random(),
                type: m.type,
                senderId: m.senderId,
                content: m.content,
                fileName: m.fileName,
                fileSize: m.fileSize,
                duration: m.duration,
                time: getTime(m.timestamp),
                timestamp: m.timestamp
              }))
            
            if (newMsgs.length > 0) {
              setMessages(prev => [...prev, ...newMsgs])
            }
            
            const maxTs = Math.max(...data.messages.map((m: any) => m.timestamp))
            setLastTimestamp(maxTs)
          }
        })
        .catch(() => {})
    }

    const timer = setInterval(poll, 500)
    return () => clearInterval(timer)
  }, [joined, lastTimestamp])

  // 发送文本消息
  const handleSend = () => {
    const text = inputText.trim()
    if (!text || !joined) return

    const now = Date.now()
    
    // 本地显示
    setMessages(prev => [...prev, {
      id: 'local_' + now,
      type: 'text',
      senderId: MY_USER_ID,
      content: text,
      time: getTime(),
      timestamp: now
    }])

    // 发送到服务器
    fetch(`${API_BASE}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: MY_USER_ID,
        content: text,
        type: 'text'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.message) {
        setLastTimestamp(data.message.timestamp)
      }
    })
    .catch(() => {})

    setInputText('')
  }

  // 发送媒体消息（模拟）
  const handleSendMedia = (type: 'audio' | 'video') => {
    setShowMediaPicker(false)
    
    const now = Date.now()
    const fileName = type === 'audio' ? `录音_${now}.mp3` : `视频_${now}.mp4`
    const fileSize = Math.floor(Math.random() * 5000000) + 500000
    const duration = Math.floor(Math.random() * 180) + 10

    // 本地显示
    setMessages(prev => [...prev, {
      id: 'local_' + now,
      type: type,
      senderId: MY_USER_ID,
      content: `/uploads/${type}/${fileName}`,
      fileName: fileName,
      fileSize: fileSize,
      duration: duration,
      time: getTime(),
      timestamp: now
    }])

    // 发送到服务器
    fetch(`${API_BASE}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: MY_USER_ID,
        content: `/uploads/${type}/${fileName}`,
        type: type,
        fileName: fileName,
        fileSize: fileSize,
        duration: duration
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.message) {
        setLastTimestamp(data.message.timestamp)
      }
    })
    .catch(() => {})
  }

  // 切换媒体选择器
  const toggleMediaPicker = () => {
    setShowMediaPicker(!showMediaPicker)
  }

  // 处理输入
  const handleInput = (e: { detail: { value: string } }) => {
    setInputText(e.detail.value)
  }

  // 切换主题
  const handleTheme = () => {
    setDarkMode(!darkMode)
  }

  const isOnline = status === '在线'

  // 渲染媒体消息卡片
  const renderMediaCard = (msg: Message, isSelf: boolean) => {
    const isAudio = msg.type === 'audio'
    return (
      <view className={isSelf ? 'media-card self' : 'media-card other'}>
        <view className={isAudio ? 'media-icon audio' : 'media-icon video'}>
          <text className="media-icon-text">{isAudio ? '🎵' : '🎬'}</text>
        </view>
        <view className="media-info">
          <text className="media-name">{msg.fileName || (isAudio ? '音频文件' : '视频文件')}</text>
          <text className="media-meta">
            {formatFileSize(msg.fileSize || 0)} · {formatDuration(msg.duration || 0)}
          </text>
        </view>
        <view className="media-play">
          <text className="play-icon">▶</text>
        </view>
      </view>
    )
  }

  return (
    <view className={darkMode ? 'chat-container dark' : 'chat-container light'}>
      {/* 头部 */}
      <view className="header">
        <view className="header-left">
          <view className="header-avatar">
            <text className="header-avatar-text">💬</text>
          </view>
          <view className="header-info">
            <text className="header-title">群聊</text>
            <view className="header-status-row">
              <view className={isOnline ? 'status-dot online' : 'status-dot'} />
              <text className="header-status">{status}</text>
            </view>
          </view>
        </view>
        <view className="header-right">
          <view className="theme-btn" bindtap={handleTheme}>
            <text className="theme-icon">{darkMode ? '☀️' : '🌙'}</text>
          </view>
        </view>
      </view>

      {/* 用户ID栏 */}
      <view className="user-bar">
        <text className="user-id">我的ID: {MY_USER_ID}</text>
      </view>

      {/* 消息列表 */}
      <scroll-view className="message-list" scroll-y={true}>
        {/* 加载更多按钮 */}
        {hasMore && (
          <view className="load-more" bindtap={loadMore}>
            <text className="load-more-text">{loading ? '加载中...' : '⬆ 加载更多历史'}</text>
          </view>
        )}

        {messages.length === 0 && !loading ? (
          <view className="empty-state">
            <text className="empty-icon">💬</text>
            <text className="empty-text">暂无消息</text>
            <text className="empty-hint">{isOnline ? '发送第一条消息开始聊天' : '等待连接...'}</text>
          </view>
        ) : (
          messages.map((msg) => (
            <view key={msg.id} className="message-item">
              {msg.type === 'system' ? (
                <view className="system-message">
                  <text className="system-text">{msg.content}</text>
                </view>
              ) : (
                <view className={msg.senderId === MY_USER_ID ? 'message-row self' : 'message-row other'}>
                  {msg.senderId !== MY_USER_ID && (
                    <view className="msg-avatar">
                      <text className="msg-avatar-text">{msg.senderId.charAt(5).toUpperCase()}</text>
                    </view>
                  )}
                  <view className="msg-content-wrapper">
                    {msg.senderId !== MY_USER_ID && (
                      <text className="msg-sender">{msg.senderId}</text>
                    )}
                    {msg.type === 'text' ? (
                      <view className={msg.senderId === MY_USER_ID ? 'msg-bubble self' : 'msg-bubble other'}>
                        <text className={msg.senderId === MY_USER_ID ? 'msg-text self' : 'msg-text other'}>
                          {msg.content}
                        </text>
                      </view>
                    ) : (
                      renderMediaCard(msg, msg.senderId === MY_USER_ID)
                    )}
                    <text className={msg.senderId === MY_USER_ID ? 'msg-time self' : 'msg-time other'}>
                      {msg.time}
                    </text>
                  </view>
                  {msg.senderId === MY_USER_ID && (
                    <view className="msg-avatar self">
                      <text className="msg-avatar-text">{MY_USER_ID.charAt(5).toUpperCase()}</text>
                    </view>
                  )}
                </view>
              )}
            </view>
          ))
        )}
      </scroll-view>

      {/* 媒体选择器 */}
      {showMediaPicker && (
        <view className="media-picker">
          <view className="media-picker-item" bindtap={() => handleSendMedia('audio')}>
            <view className="picker-icon audio">
              <text className="picker-icon-text">🎵</text>
            </view>
            <text className="picker-label">发送音频</text>
          </view>
          <view className="media-picker-item" bindtap={() => handleSendMedia('video')}>
            <view className="picker-icon video">
              <text className="picker-icon-text">🎬</text>
            </view>
            <text className="picker-label">发送视频</text>
          </view>
        </view>
      )}

      {/* 输入区域 */}
      <view className="input-area">
        <view className="attach-btn" bindtap={toggleMediaPicker}>
          <text className="attach-icon">{showMediaPicker ? '✕' : '+'}</text>
        </view>
        <input
          className="message-input"
          placeholder={isOnline ? '输入消息...' : '等待连接...'}
          bindinput={handleInput}
          bindconfirm={handleSend}
        />
        <view className={inputText.trim() && isOnline ? 'send-btn active' : 'send-btn'} bindtap={handleSend}>
          <text className="send-icon">➤</text>
        </view>
      </view>
    </view>
  )
}
