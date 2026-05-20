// 清除可能导致 Electron 以 Node 模式运行的环境变量
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const express = require('express');
const httpProxy = require('http-proxy');

let mainWindow;
let server;
const PORT = 3456;
const API_TARGET = 'https://zuowei.hryz.cc';
const proxy = httpProxy.createProxyServer({ target: API_TARGET, changeOrigin: true, secure: false });

function getStaticDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar');
  }
  return __dirname;
}

function startLocalServer() {
  const app = express();
  const staticDir = getStaticDir();

  app.use(express.static(staticDir));

  app.use('/api', (req, res) => {
    proxy.web(req, res, {}, (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: '后端服务不可用', detail: err.message });
      }
    });
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
      webSecurity: true
    },
    show: false
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
      message: '确定要退出优座吗？'
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
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
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
      ]
    },
    {
      label: '功能',
      submenu: [
        { label: '排座系统', click: () => mainWindow && mainWindow.loadURL(`http://localhost:${PORT}`) },
        { label: '均衡排座方案管理', click: () => mainWindow && mainWindow.loadURL(`http://localhost:${PORT}/fake-random.html`) },
        { type: 'separator' },
        { label: '用浏览器打开', click: () => shell.openExternal('https://zuowei.hryz.cc') },
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '访问网站', click: () => shell.openExternal('https://zuowei.hryz.cc') },
        { label: '合味随笔', click: () => shell.openExternal('https://20060920.xyz') },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      ]
    }
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
