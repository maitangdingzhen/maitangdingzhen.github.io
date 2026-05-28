// netlify/functions/chat.js
// Netlify Serverless Function — 代理到 DeepSeek API（非流式）
// 部署后在 Netlify Dashboard 设置环境变量 DEEPSEEK_API_KEY

import { SYSTEM_PROMPT } from '../../skills/index.js';

export async function handler(event) {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: '仅支持 POST 请求' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: '请求格式错误' }) };
  }

  const { message, history = [] } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: '消息不能为空' }) };
  }
  if (!DEEPSEEK_API_KEY) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'API Key 未设置' }) };
  }

  const trimmedHistory = history.slice(-20);
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
        max_tokens: 2048,
        temperature: 0.7,
        messages
      })
    });

    if (!response.ok) {
      const status = response.status;
      const errorMap = {
        401: 'API 密钥无效', 402: 'API 余额不足', 429: '请求过于频繁，请稍后重试',
        500: 'AI 服务暂时不可用', 503: 'AI 服务繁忙'
      };
      return { statusCode: status, headers: corsHeaders(), body: JSON.stringify({ error: errorMap[status] || '服务异常', code: 'API_ERROR' }) };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        id: data.id,
        content: [{ type: 'text', text: data.choices?.[0]?.message?.content || '' }],
        stop_reason: data.choices?.[0]?.finish_reason || 'stop',
        model: data.model
      })
    };
  } catch {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: '网络连接失败，请检查后重试', code: 'NETWORK_ERROR' }) };
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://maitangdingzhen.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
