/**
 * 座位表系统 - Cloudflare Pages Worker
 *
 * 处理 /api 的用户注册、登录、保存、加载接口
 * 其他请求透传静态文件
 *
 * KV 命名空间绑定：SEAT_DATA
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// 生成随机 Token（32 位十六进制）
function generateToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 哈希
async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(password + ':' + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

// 验证 Token，返回 userId
async function verifyToken(authHeader, kv) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const raw = await kv.get('token:' + token);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.exp < Date.now()) {
      await kv.delete('token:' + token);
      return null;
    }
    return data.userId;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 只处理 /api 路径
    if (url.pathname === '/api') {
      const kv = env.SEAT_DATA;
      if (!kv) {
        return jsonResponse({ success: false, message: 'KV 存储未配置，请绑定 SEAT_DATA 命名空间' }, 500);
      }

      // OPTIONS 预检
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      const action = url.searchParams.get('action');

      try {
        // ===== 用户注册 =====
        if (action === 'register') {
          if (request.method !== 'POST') {
            return jsonResponse({ success: false, message: '请使用 POST 方法' });
          }
          const body = await request.json();
          const username = (body.username || '').trim();
          const password = body.password || '';

          if (username.length < 3 || username.length > 20) {
            return jsonResponse({ success: false, message: '用户名需 3-20 个字符' });
          }
          if (password.length < 6) {
            return jsonResponse({ success: false, message: '密码至少 6 位' });
          }
          if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return jsonResponse({ success: false, message: '用户名只能包含字母、数字、下划线' });
          }

          // 检查是否已注册
          const existing = await kv.get('user:' + username);
          if (existing) {
            return jsonResponse({ success: false, message: '用户名已被注册' });
          }

          // 创建用户
          const salt = Math.random().toString(36).slice(2, 10);
          const passwordHash = await hashPassword(password, salt);
          const userId = generateToken().slice(0, 12);

          const userData = {
            id: userId,
            username,
            passwordHash,
            salt,
            createdAt: Date.now(),
            lastLogin: Date.now(),
          };
          await kv.put('user:' + username, JSON.stringify(userData));
          await kv.put('uid:' + userId, username);

          // 生成 token
          const token = generateToken();
          const tokenData = { userId, username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
          await kv.put('token:' + token, JSON.stringify(tokenData), { expirationTtl: 30 * 24 * 3600 });

          return jsonResponse({
            success: true,
            message: '注册成功',
            token,
            username,
          });
        }

        // ===== 用户登录 =====
        if (action === 'login') {
          if (request.method !== 'POST') {
            return jsonResponse({ success: false, message: '请使用 POST 方法' });
          }
          const body = await request.json();
          const username = (body.username || '').trim();
          const password = body.password || '';

          if (!username || !password) {
            return jsonResponse({ success: false, message: '请输入用户名和密码' });
          }

          const raw = await kv.get('user:' + username);
          if (!raw) {
            return jsonResponse({ success: false, message: '用户名或密码错误' });
          }

          const userData = JSON.parse(raw);
          const hash = await hashPassword(password, userData.salt);
          if (hash !== userData.passwordHash) {
            return jsonResponse({ success: false, message: '用户名或密码错误' });
          }

          // 更新登录时间
          userData.lastLogin = Date.now();
          await kv.put('user:' + username, JSON.stringify(userData));

          // 生成 token
          const token = generateToken();
          const tokenData = { userId: userData.id, username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
          await kv.put('token:' + token, JSON.stringify(tokenData), { expirationTtl: 30 * 24 * 3600 });

          return jsonResponse({
            success: true,
            message: '登录成功',
            token,
            username,
          });
        }

        // ===== 保存数据 =====
        if (action === 'save') {
          if (request.method !== 'POST') {
            return jsonResponse({ success: false, message: '请使用 POST 方法' });
          }
          const userId = await verifyToken(request.headers.get('Authorization'), kv);
          if (!userId) {
            return jsonResponse({ success: false, message: '未登录或登录已过期' }, 401);
          }

          const body = await request.json();
          if (!body.data || typeof body.data !== 'object') {
            return jsonResponse({ success: false, message: '数据格式错误' });
          }

          const saved = [];
          for (const [key, value] of Object.entries(body.data)) {
            const dataKey = 'data:' + userId + ':' + key;
            const entry = {
              value,
              updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
            };
            await kv.put(dataKey, JSON.stringify(entry));
            saved.push(key);
          }

          return jsonResponse({
            success: true,
            message: '保存成功',
            saved,
            time: new Date().toISOString().replace('T', ' ').slice(0, 19),
          });
        }

        // ===== 读取数据 =====
        if (action === 'load') {
          const userId = await verifyToken(request.headers.get('Authorization'), kv);
          if (!userId) {
            return jsonResponse({ success: false, message: '未登录或登录已过期' }, 401);
          }

          const keysParam = url.searchParams.get('keys') || '';
          const data = {};

          if (keysParam) {
            // 读取指定 keys
            const keyList = keysParam.split(',');
            for (const key of keyList) {
              const raw = await kv.get('data:' + userId + ':' + key.trim());
              if (raw) {
                data[key.trim()] = JSON.parse(raw);
              }
            }
          } else {
            // 读取所有数据（遍历前缀）
            const prefix = 'data:' + userId + ':';
            const list = await kv.list({ prefix });
            for (const item of list.keys) {
              const key = item.name.slice(prefix.length);
              const raw = await kv.get(item.name);
              if (raw) {
                data[key] = JSON.parse(raw);
              }
            }
          }

          return jsonResponse({
            success: true,
            data,
            time: new Date().toISOString().replace('T', ' ').slice(0, 19),
          });
        }

        return jsonResponse({ success: false, message: '未知操作' });

      } catch (err) {
        console.error('API error:', err);
        return jsonResponse({ success: false, message: '服务器内部错误: ' + (err.message || '未知错误') }, 500);
      }
    }

    // 其他请求：透传静态文件
    return env.ASSETS.fetch(request);
  },
};
