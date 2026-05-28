// api/chat.js
// Vercel Serverless Function — 代理前端请求到 Claude API
// 部署后 API Key 在 Vercel Dashboard 设置环境变量 ANTHROPIC_API_KEY

import { SYSTEM_PROMPT } from '../skills/index.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://maitangdingzhen.github.io';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 预检请求
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持 POST 请求' });

  const { message, history = [] } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: '服务配置错误：API Key 未设置', code: 'NO_API_KEY' });
  }

  // 裁剪历史消息（保留最近 24 条 = 12 轮对话）
  const trimmedHistory = history.slice(-24);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [...trimmedHistory, { role: 'user', content: message }]
      })
    });

    if (!response.ok) {
      const status = response.status;
      const errorMap = {
        401: 'API 密钥无效，请联系管理员',
        403: 'API 权限不足',
        429: '请求过于频繁，请稍后重试',
        500: 'AI 服务暂时不可用，请稍后重试',
        529: 'AI 服务繁忙，请稍后重试'
      };
      return res.status(status).json({
        error: errorMap[status] || '服务异常，请稍后重试',
        code: 'API_ERROR'
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: '网络连接失败，请检查后重试',
      code: 'NETWORK_ERROR'
    });
  }
}
