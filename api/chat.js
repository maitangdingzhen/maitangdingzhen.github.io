// api/chat.js
// Vercel Serverless Function — 多智能体架构：编排器分类意图 → 路由到专业 Agent
// 部署后在 Vercel Dashboard 设置环境变量 DEEPSEEK_API_KEY

import { AGENTS, classifyIntent, getAgentSystemPrompt } from '../skills/index.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://maitangdingzhen.github.io';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持 POST 请求' });

  const { message, history = [], currentAgent } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: '服务配置错误：API Key 未设置', code: 'NO_API_KEY' });
  }

  // === 多智能体路由：编排器分类意图，选择最匹配的专业 Agent ===
  const agentId = classifyIntent(message, currentAgent);
  const agent = AGENTS[agentId];
  const systemPrompt = getAgentSystemPrompt(agentId);

  // 裁剪历史消息（保留最近 24 条 = 12 轮对话）
  const trimmedHistory = history.slice(-24);

  const messages = [
    { role: 'system', content: systemPrompt },
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
        messages
      })
    });

    if (!response.ok) {
      const status = response.status;
      const errData = await response.json().catch(() => ({}));
      const errorMap = {
        401: 'API 密钥无效，请检查 DeepSeek API Key',
        402: 'API 余额不足，请充值',
        429: '请求过于频繁，请稍后重试',
        500: 'AI 服务暂时不可用，请稍后重试',
        503: 'AI 服务繁忙，请稍后重试'
      };
      return res.status(status).json({
        error: errorMap[status] || (errData.error?.message || '服务异常，请稍后重试'),
        code: 'API_ERROR'
      });
    }

    const data = await response.json();
    const deepseekContent = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({
      id: data.id,
      content: [{ type: 'text', text: deepseekContent }],
      stop_reason: data.choices?.[0]?.finish_reason || 'stop',
      model: data.model,
      // 多智能体元数据 — 前端据此展示当前激活的 Agent
      agent: agentId,
      agentName: agent.name,
      agentIcon: agent.icon
    });

  } catch (error) {
    return res.status(500).json({
      error: '网络连接失败，请检查后重试',
      code: 'NETWORK_ERROR'
    });
  }
}
