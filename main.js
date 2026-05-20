const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');

let mainWindow;
const BASE_URL = 'https://zuowei.hryz.cc';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '优座',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    show: false
  });

  mainWindow.loadURL(BASE_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 新窗口用默认浏览器打开（如登录跳转）
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
      icon: path.join(__dirname, 'icon.ico')
    });
    if (response === 0) {
      mainWindow.destroy();
      app.quit();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 原生菜单
function setAppMenu() {
  const template = [
    {
      label: '优座',
      submenu: [
        { label: '关于优座', role: 'about' },
        { type: 'separator' },
        { label: '偏好设置', accelerator: 'CmdOrCtrl+,', click: () => {
          mainWindow && mainWindow.loadURL(BASE_URL);
        }},
        { type: 'separator' },
        { label: '隐藏', role: 'hide' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => { app.quit(); } }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新页面', accelerator: 'F5', click: () => {
          mainWindow && mainWindow.reload();
        }},
        { label: '强制刷新', accelerator: 'CmdOrCtrl+F5', click: () => {
          mainWindow && mainWindow.webContents.reloadIgnoringCache();
        }},
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
        { label: '打开排座系统', click: () => {
          mainWindow && mainWindow.loadURL(BASE_URL);
        }},
        { label: '均衡排座方案管理', click: () => {
          mainWindow && mainWindow.loadURL(BASE_URL + '/fake-random.html');
        }},
        { type: 'separator' },
        { label: '用浏览器打开', click: () => {
          shell.openExternal(BASE_URL);
        }},
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '访问网站', click: () => { shell.openExternal(BASE_URL); }},
        { label: '合味随笔', click: () => { shell.openExternal('https://20060920.xyz'); }},
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  setAppMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
