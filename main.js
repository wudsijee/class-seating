const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const express = require('express');

let mainWindow;
let server;
const PORT = 3456;
const API_TARGET = 'https://zuowei.hryz.cc';

function getStaticDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar');
  }
  return __dirname;
}

// 手动代理：用 fetch 转发，确保 body 和方法都正确
function proxyApiRequest(req, res) {
  (async () => {
    try {
      const url = new URL(req.url, API_TARGET);

      // 读取原始 body（Express 未解析时，req 本身是流）
      let body = null;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve) => req.on('end', resolve));
        body = Buffer.concat(chunks);
      }

      // 构造转发 headers，去掉 host（fetch 会自动设）
      const headers = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (key.toLowerCase() !== 'host') headers[key] = val;
      }

      const resp = await fetch(url.toString(), {
        method: req.method,
        headers,
        body,
      });

      // 转发响应
      res.statusCode = resp.status;
      resp.headers.forEach((val, key) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, val);
        }
      });
      const buf = Buffer.from(await resp.arrayBuffer());
      res.end(buf);
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: '代理错误', detail: err.message }));
      }
    }
  })();
}

function startLocalServer() {
  const app = express();
  const staticDir = getStaticDir();

  app.use(express.static(staticDir));

  // API 代理：手动转发
  app.use('/api', (req, res) => {
    proxyApiRequest(req, res);
  });

  return new Promise((resolve, reject) => {
    server = app.listen(PORT, () => resolve());
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        server = app.listen(PORT + 1, () => { PORT += 1; resolve(); });
      } else {
        reject(err);
      }
    });
  });
}

function createWindow() {
  const iconPath = path.join(getStaticDir(), 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '优座',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    event.preventDefault();
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['退出', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '确认退出',
      message: '确定要退出优座吗？',
    });
    if (response === 0) {
      mainWindow.destroy();
      if (server) server.close();
      app.quit();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function setAppMenu() {
  const template = [
    {
      label: '优座',
      submenu: [
        { label: '关于优座', role: 'about' },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新页面', accelerator: 'F5', click: () => mainWindow && mainWindow.reload() },
        { label: '强制刷新', accelerator: 'CmdOrCtrl+F5', click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetzoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomin' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomout' },
      ],
    },
    {
      label: '功能',
      submenu: [
        { label: '排座系统', click: () => mainWindow && mainWindow.loadURL(`http://localhost:${PORT}`) },
        { label: '均衡排座方案管理', click: () => mainWindow && mainWindow.loadURL(`http://localhost:${PORT}/fake-random.html`) },
        { type: 'separator' },
        { label: '用浏览器打开', click: () => shell.openExternal('https://zuowei.hryz.cc') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '访问网站', click: () => shell.openExternal('https://zuowei.hryz.cc') },
        { label: '合味随笔', click: () => shell.openExternal('https://20060920.xyz') },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    await startLocalServer();
    console.log(`本地服务器已启动：http://localhost:${PORT}`);
  } catch (e) {
    console.error('启动本地服务器失败：', e);
    app.quit();
    return;
  }
  setAppMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
