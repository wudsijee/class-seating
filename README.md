# 座位表系统 - Cloudflare Pages 部署指南

## 需要上传的文件

```
根目录
├── index.html       ← 座位表主页面（API 已改为 /api）
├── _worker.js       ← 后端 API（用户注册/登录/数据保存/读取）
└── images/          ← 图片资源
    ├── BIZ1.GIF
    ├── BIZ2.GIF
    ├── BIZ3.GIF
    ├── BIZ4.GIF
    └── BIZ5.GIF
```

**不需要上传** `api/` 目录下的 PHP 文件。

## 上传步骤

1. https://dash.cloudflare.com → **Workers & Pages** → **创建应用** → **Pages** → **上传资产**
2. 项目名称填：`seat-system`（或你喜欢的名字）
3. 选中 `index.html`、`_worker.js`、`images/` 文件夹，一起拖拽上传
4. 部署完成

## 配置 KV 绑定

1. **创建 KV 命名空间**：Workers & Pages → **KV** → **创建命名空间**，名称填 `SEAT_DATA`
2. **绑定到项目**：进入项目 → **设置** → **函数** → **KV 命名空间绑定** → **添加绑定**
   - 变量名称：`SEAT_DATA`
   - KV 命名空间：选择刚创建的 `SEAT_DATA`
3. 保存后，重新部署一次
