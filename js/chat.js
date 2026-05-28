// js/chat.js
// 栖野旅行 AI 助手 — 前端聊天逻辑
// 部署后，将下方的 API_URL 替换为实际函数地址

// ===== 配置 (部署 Netlify/Vercel 后修改此 URL) =====
const API_URL = 'https://lambent-moxie-cd41dc.netlify.app/api/chat';
const DEMO_MODE = false;

// ===== 状态 =====
const state = {
  history: [],       // [{ role: 'user'|'assistant', content: '...' }]
  isLoading: false
};

// ===== DOM 元素 =====
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const welcomeMsg = document.getElementById('welcomeMsg');

// ===== 发送消息 =====
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || state.isLoading) return;

  if (welcomeMsg) welcomeMsg.remove();

  addMessage('user', text);
  state.history.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.focus();

  state.isLoading = true;
  sendBtn.disabled = true;

  if (DEMO_MODE) {
    // 演示模式（模拟流式输出）
    await sleep(600);
    const typingEl = showTypingIndicator();
    await sleep(800);
    typingEl.remove();
    const responseText = getDemoResponse(text);
    const { cleanText, ctaText } = extractCta(responseText);
    addMessage('assistant', cleanText, ctaText);
    state.history.push({ role: 'assistant', content: responseText });
    state.isLoading = false;
    sendBtn.disabled = false;
    return;
  }

  // === 正式模式：流式调用 DeepSeek ===
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: state.history.slice(0, -1) })
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = '服务异常，请稍后重试';
      try {
        // 尝试从 SSE 错误中提取
        const sseMatch = errText.match(/"error":"([^"]+)"/);
        if (sseMatch) errMsg = sseMatch[1];
      } catch {}
      throw new Error(errMsg);
    }

    // 创建空气泡，准备流式填充
    const { bubble, msgDiv } = createStreamingBubble();
    let fullText = '';
    let ctaText = null;

    // 读取 SSE 流
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的最后一行

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            // 实时更新气泡（仅在内容足够时渲染以减少抖动）
            updateStreamingBubble(bubble, fullText);
            scrollToBottom();
          }
        } catch {}
      }
    }

    // 流完成，最终渲染
    const { cleanText, ctaText: detectedCta } = extractCta(fullText);
    ctaText = detectedCta;
    finalizeBubble(bubble, cleanText, ctaText);

    state.history.push({ role: 'assistant', content: fullText });

  } catch (error) {
    showError(error.message || '网络连接失败，请检查后重试');
  } finally {
    state.isLoading = false;
    sendBtn.disabled = false;
  }
}

// ===== 创建流式气泡 =====
function createStreamingBubble() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<span class="streaming-cursor"></span>';
  msgDiv.appendChild(bubble);
  chatContainer.appendChild(msgDiv);
  return { bubble, msgDiv };
}

// ===== 更新流式气泡内容 =====
let streamUpdateTimer = null;
function updateStreamingBubble(bubble, text) {
  // 节流：每 80ms 最多更新一次，避免高频 DOM 操作
  if (streamUpdateTimer) return;
  streamUpdateTimer = setTimeout(() => {
    streamUpdateTimer = null;
    let html = marked.parse(text);
    html = wrapDayCards(html);
    bubble.innerHTML = html + '<span class="streaming-cursor"></span>';
  }, 80);
}

// ===== 流完成，移除光标并添加 CTA =====
function finalizeBubble(bubble, text, ctaText) {
  if (streamUpdateTimer) { clearTimeout(streamUpdateTimer); streamUpdateTimer = null; }
  let html = marked.parse(text);
  html = wrapDayCards(html);
  bubble.innerHTML = html;

  if (ctaText) {
    const ctaBar = document.createElement('div');
    ctaBar.className = 'cta-bar';
    ctaBar.innerHTML = `<p>${ctaText}</p><button class="cta-btn" onclick="openCtaModal(event)">加微信 · 领取完整方案</button>`;
    bubble.appendChild(ctaBar);
  }
}

// ===== 包裹行程日卡片 =====
function wrapDayCards(html) {
  html = html.replace(/<h3>📅[\s\S]*?(?=<h3>📅|$)/g, m => `<div class="day-card">${m}</div>`);
  html = html.replace(/(<h2>📅[\s\S]*?)(?=<h2>|$)/g, m => `<div class="day-card">${m}</div>`);
  return html;
}

// ===== 快捷建议点击 =====
function sendSuggestion(text) {
  chatInput.value = text;
  sendMessage();
}

// ===== 在聊天天中添加消息 =====
function addMessage(role, rawText, ctaText) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (role === 'assistant') {
    let html = marked.parse(rawText);
    html = wrapDayCards(html);
    bubble.innerHTML = html;

    // CTA 引导条
    if (ctaText) {
      const ctaBar = document.createElement('div');
      ctaBar.className = 'cta-bar';
      ctaBar.innerHTML = `
        <p>${ctaText}</p>
        <button class="cta-btn" onclick="openCtaModal(event)">加微信 · 领取完整方案</button>
      `;
      bubble.appendChild(ctaBar);
    }
  } else {
    bubble.textContent = rawText;
  }

  msgDiv.appendChild(bubble);
  chatContainer.appendChild(msgDiv);
  scrollToBottom();
}

// ===== 打字指示器 =====
function showTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  chatContainer.appendChild(el);
  scrollToBottom();
  return el;
}

// ===== 错误提示 =====
function showError(text) {
  const el = document.createElement('div');
  el.className = 'error-msg';
  el.textContent = '⚠ ' + text;
  chatContainer.appendChild(el);
  scrollToBottom();
  // 3秒后自动消失
  setTimeout(() => { if (el.parentNode) el.remove(); }, 5000);
}

// ===== 提取 CTA 标记 =====
function extractCta(text) {
  const match = text.match(/\[cta\]([\s\S]*?)\[\/cta\]/);
  if (match) {
    return {
      cleanText: text.replace(/\[cta\][\s\S]*?\[\/cta\]/, '').trim(),
      ctaText: match[1].trim()
    };
  }
  return { cleanText: text, ctaText: null };
}

// ===== CTA 弹窗（复用首页的留资逻辑） =====
function openCtaModal(e) {
  if (e) e.preventDefault();
  // 复用现有 modal 或创建简易弹窗
  let modal = document.getElementById('ctaModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ctaModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <button class="modal-close" onclick="closeCtaModal()">&times;</button>
        <h3 style="font-family:'Noto Serif SC',Georgia,serif;font-size:1.3rem;margin-bottom:8px;">开启你的武汉专属定制</h3>
        <p style="font-size:0.88rem;color:var(--ink-light);margin-bottom:20px;line-height:1.7;">
          留下联系方式，我们会在 <strong>24小时内</strong> 为你发送一份<strong>免费的初步行程方案</strong>，同时附赠《武汉隐秘书境 · 电子地图》。
        </p>
        <form onsubmit="handleCtaSubmit(event)" style="display:flex;flex-direction:column;gap:12px;">
          <input type="text" id="ctaName" placeholder="你的称呼" required style="padding:12px 16px;border:1.5px solid var(--border);border-radius:8px;font-size:0.9rem;background:var(--warm-white);">
          <input type="text" id="ctaContact" placeholder="微信号或手机号" required style="padding:12px 16px;border:1.5px solid var(--border);border-radius:8px;font-size:0.9rem;background:var(--warm-white);">
          <button type="submit" class="cta-btn" style="width:100%;padding:14px;margin-top:4px;">提交 · 领取免费方案</button>
        </form>
        <p style="font-size:0.75rem;color:var(--ink-light);margin-top:12px;text-align:center;">你的信息仅用于行程沟通，没有强制消费。</p>
      </div>
    `;
    // 注入简易 modal 样式
    const style = document.createElement('style');
    style.textContent = `
      .modal-overlay { position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.3s; }
      .modal-overlay.active { opacity:1;pointer-events:auto; }
      .modal { background:#fff;border-radius:12px;padding:36px 32px;max-width:420px;width:90%;position:relative;box-shadow:0 8px 40px rgba(0,0,0,0.12); }
      .modal-close { position:absolute;top:12px;right:16px;background:none;border:none;font-size:1.5rem;cursor:pointer;color:#999; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);

    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) closeCtaModal();
    });
  }
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCtaModal() {
  const modal = document.getElementById('ctaModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function handleCtaSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('ctaName').value.trim();
  if (!name) return;
  const form = e.target;
  form.innerHTML = `
    <div style="text-align:center;padding:16px 0;">
      <p style="font-size:1.5rem;margin-bottom:8px;">🎉</p>
      <p style="font-size:1rem;font-weight:600;margin-bottom:6px;">提交成功！</p>
      <p style="font-size:0.85rem;color:var(--ink-light);line-height:1.7;">
        感谢你的信任，<strong>${escapeHtml(name)}</strong>。<br>
        我们会在 <strong>24小时内</strong> 联系你，<br>
        发送免费方案和《武汉隐秘书境 · 电子地图》。<br><br>
        急的话直接加微信：<strong>qiyetravel_wuhan</strong>
      </p>
    </div>
  `;
  setTimeout(closeCtaModal, 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 工具函数 =====
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 演示模式（无需后端即可展示效果） =====
function getDemoResponse(text) {
  if (text.includes('拍照') || text.includes('摄影') || text.includes('复古')) {
    return `太棒了！武汉是国内拍复古风的天花板城市 📸

## 🎞️ 复古胶片风 · 拍摄攻略

### 📍 推荐地点
汉口租界区——黎黄陂路、洞庭街、青岛路一带，百年老建筑的红砖墙和老式阳台，随便一个转角都有民国电影的感觉。

### 📸 最佳机位
1. **巴公房子**对面小巷：站在鄱阳街与洞庭街三角路口，用长焦从斑马线对面拍摄，让红砖墙和法式窗棂成为背景
2. **古德寺圆通宝殿回廊**：下午3点的阳光穿过柱廊，刚好打在人物侧脸
3. **合作路**：利用老楼梯间拍出纵深故事感

### 👗 穿搭指南
贝雷帽 + 卡其风衣 + 格纹围巾 + 深色口红。手里拿一份旧报纸或一束干花做道具。

### ☀️ 光影时间
下午3点-5点，阳光穿过梧桐叶洒下斑驳光影——这是最佳拍摄窗口。

[cta]想要完整的复古风拍摄路线和12个独家机位？加微信发你《武汉隐秘书境 · 摄影地图》📷[/cta]`;
  }

  if (text.includes('吃') || text.includes('美食') || text.includes('吃货')) {
    return `## 🍜 武汉地道美食之旅

作为一个武汉在地吃货，我绝对不会带你去户部巷！以下是我的私藏清单：

### 🌅 过早（早餐）
- **山海关路**：本地人排队的**李记热干面**，配上隔壁的**蛋酒**，人均8元吃出幸福感
- **三镇民生甜食馆**：武汉最早的民生甜食馆，糊汤粉配油条是灵魂吃法
- **赵师傅油饼包烧卖**：虽然要排队，但值得——油饼+烧卖的碳水炸弹组合

### 🍲 正餐
- **万松园**（不是户部巷！）：**巴厘龙虾**的油焖大虾、**夏氏砂锅**的全家福
- **水塔街**：本地大学生扎堆的地方，**敖四烧烤**的烤鸡翅绝了

### 🌃 夜宵
- 长江轮渡坐一趟（1.5元），然后去江滩边的精酿啤酒吧喝酒看江景

[cta]想要完整版《武汉苍蝇馆子地图》？20家本地人私藏店铺，加微信发你 🗺️[/cta]`;
  }

  // 默认：行程规划
  return `## 🗺️ 江城旧梦——2天1晚武汉深度人文之旅

> 情侣出游 · 预算约 ¥2,400（2人） · 小众 × 摄影 × 美食

---

### 📅 Day 1：老汉口的浪漫 Citywalk

**☀️ 上午 9:00-12:00**
- **山海关路过早**：热干面+蛋酒（人均¥8），和本地人坐同一条板凳
- **古德寺**（门票¥8）：重点是圆通宝殿回廊的光影，不是大殿前的排队位

**🌤 下午 13:00-17:00**
- **黎黄陂路→巴公房子→洞庭街→青岛路**：梧桐树影下的百年租界区，每一条巷子都是电影取景地
- 找一家老洋房咖啡馆发呆（推荐：**蒹葭艺术咖啡馆**）
- 🚇 交通：全程步行，各点间距步行5-10分钟

**🌙 晚上 18:00-21:00**
- **万松园**晚餐：巴厘龙虾 + 绿豆汤
- **武汉关轮渡**（¥1.5/人）：坐轮渡横渡长江，看两岸灯光——这是武汉最浪漫的1.5块钱

---

### 📅 Day 2：江与城的诗意

**☀️ 上午 9:30-12:00**
- **汉口江滩三期芦苇荡**：避开人群，秋季芦苇无边，废弃的小船是绝佳情绪片道具
- 🚖 交通：打车￥15从江汉路到江滩三期

**🌤 下午 13:00-16:00**
- **琴台美术馆**（免费，需预约）：银色曲面屋顶 + 极简几何线条，建筑本身就是艺术品
- 🚇 交通：地铁6号线琴台站

---

### 🍽 美食地图
| 店名 | 必点 | 人均 |
|------|------|------|
| 李记热干面（山海关路） | 热干面+蛋酒 | ¥8 |
| 巴厘龙虾（万松园） | 油焖大虾 | ¥80 |
| 夏氏砂锅（万松园） | 全家福砂锅 | ¥60 |

### 📷 旅拍规划
- Day 1 下午 3-5 点在租界区跟拍 1 小时（黄金光线）
- 穿搭：卡其风衣 + 贝雷帽（法式复古风）
- Day 2 上午江滩拍情绪片（纯色连衣裙 / 白色衬衫）

[cta]很高兴你看到了最后！😊 这个方案可以根据你的具体日期和偏好进一步细化。加个微信？我把《武汉隐秘书境 · 电子地图》发给你，里面还有更多不为人知的隐藏机位～[/cta]`;
}

// ===== 键盘快捷键 =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCtaModal();
});
