# 栖野旅行 (QIYO TRAVEL)

> 在武汉，发现只有本地人知道的秘境 —— AI 驱动的武汉文旅智能规划助手

[![Deploy to GitHub Pages](https://github.com/maitangdingzhen/maitangdingzhen.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/maitangdingzhen/maitangdingzhen.github.io/actions/workflows/deploy.yml)

## 项目简介

栖野旅行是一个面向武汉本地文旅市场的智能规划系统。通过**多智能体架构**（1 个编排器 + 6 个专业 Agent），将用户的模糊旅游需求自动转化为个性化的行程方案、小众景点推荐和旅拍攻略。

在线体验：[maitangdingzhen.github.io](https://maitangdingzhen.github.io/)

## 多智能体架构

系统采用 **Orchestrator + Specialized Agents** 模式：

```
用户消息
  ↓
编排器 (classifyIntent) —— 语义分析，识别用户意图
  ↓
┌──────────────────────────────────────────────────────┐
│  🗺️ 路线规划师    🔍 在地探索家    📷 旅拍策划师    │
│  行程定制+美食    小众秘境挖掘      机位+穿搭+光影    │
│  💬 客服专家      📖 首席故事官    🤝 销售顾问      │
│  FAQ+价格安全     案例建立信任      留资转化引导      │
└──────────────────────────────────────────────────────┘
  ↓
DeepSeek API → 生成专业回复 → 返回前端
```

每个 Agent 拥有独立的 System Prompt，互不干扰。编排器通过意图分类自动路由，用户感知不到 Agent 切换——只看到不同领域的专业回答。

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JS，Markdown 实时渲染 |
| 后端 | Netlify Functions / Vercel Serverless |
| AI | DeepSeek Chat API，多 Agent System Prompt 编排 |
| 部署 | GitHub Pages + GitHub Actions 自动部署 |

## 项目结构

```
.
├── index.html                  # 品牌落地页
├── ai-assistant.html           # AI 聊天助手页面
├── js/chat.js                  # 前端聊天逻辑 + Agent 指示器
├── css/chat.css                # 聊天页样式
├── skills/index.js             # 6 个 Agent 定义 + 编排器路由
├── api/chat.js                 # Vercel 无服务器函数
├── netlify/functions/chat.js   # Netlify 无服务器函数
├── .github/
│   ├── workflows/deploy.yml    # GitHub Actions 自动部署
│   └── skills/                 # Agent Skill 定义文档
└── images/                     # 景点与案例图片
```

## 本地运行

```bash
# 启动本地服务器
npx serve .

# 或使用 Python
python -m http.server 8080
```

AI 聊天功能需要配置后端环境变量 `DEEPSEEK_API_KEY`，部署到 Netlify/Vercel 后设置。

## License

MIT
