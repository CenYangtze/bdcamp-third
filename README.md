## 🚀 快速开始

### 1. 安装依赖

```bash
# 前端依赖
pnpm install

# 后端依赖
cd server
npm install
```

### 2. 启动后端服务器

```bash
cd server
node app.js
```

服务器将在 `http://0.0.0.0:3003` 启动

### 3. 启动 Lynx 开发服务器

```bash
pnpm run dev
```

### 4. 连接 Lynx Explorer

1. 在手机上打开 Lynx Explorer App
2. 扫描终端中显示的二维码
3. 确保手机和电脑在同一 WiFi 网络

## ⚙️ 配置

在 `src/App.tsx` 中修改服务器地址：

```typescript
const SERVER_URL = 'http://你的电脑IP:3003'
```
