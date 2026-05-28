// netlify/functions/chat.js
// Netlify Serverless Function — 流式代理前端请求到 DeepSeek API
// 部署后在 Netlify Dashboard 设置环境变量 DEEPSEEK_API_KEY

import { SYSTEM_PROMPT } from '../../skills/index.js';

export async function handler(event) {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: sseHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: sseHeaders(), body: '仅支持 POST 请求' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, headers: sseHeaders(), body: '请求格式错误' };
  }

  const { message, history = [] } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { statusCode: 400, headers: sseHeaders(), body: '消息不能为空' };
  }

  if (!DEEPSEEK_API_KEY) {
    return { statusCode: 500, headers: sseHeaders(), body: 'API Key 未设置' };
  }

  const trimmedHistory = history.slice(-24);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...trimmedHistory,
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
        messages
      })
    });

    if (!response.ok) {
      const status = response.status;
      const errorMap = { 401: 'API 密钥无效', 402: 'API 余额不足', 429: '请求过于频繁', 500: 'AI 服务暂时不可用', 503: 'AI 服务繁忙' };
      return { statusCode: status, headers: sseHeaders(), body: `data: ${JSON.stringify({ error: errorMap[status] || '服务异常' })}\n\n` };
    }

    // 直接将 DeepSeek 的 SSE 流管道返回给客户端
    return { statusCode: 200, headers: sseHeaders(), body: response.body };

  } catch {
    return { statusCode: 500, headers: sseHeaders(), body: 'data: {"error":"网络连接失败"}\n\n' };
  }
}

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'https://maitangdingzhen.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
