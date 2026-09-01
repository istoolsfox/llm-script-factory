# 🎬 Script Factory AI

**全流程 AI 短剧创作工作站**

一键生成 80-100 集短剧剧本的 AI 辅助创作工具。从一个创意点子开始，经过 6 个阶段的 AI 辅助，最终产出完整的分集剧本。

> **⚠️ 二次开发声明**
> 本仓库（`istoolsfox/llm-script-factory`）为基于 [oidahdsah0/llm-script-factory](https://github.com/oidahdsah0/llm-script-factory) 的 **二次开发（fork / secondary development）** 版本。
> 原始项目：[https://github.com/oidahdsah0/llm-script-factory](https://github.com/oidahdsah0/llm-script-factory)
> 在此基础上的改动：升级前端为 Next.js、统一异常处理、增强 LLM 网关、收紧 CORS、移除风险控制模块等。

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ 功能特色

- 🚀 **全流程覆盖**：从创意到成品剧本，6 个阶段一站式完成
- 🤖 **多模型支持**：支持阿里云百炼 Qwen 等 OpenAI 兼容大模型
- ⚙️ **可视化配置**：内置 API Key 和模型管理页面，无需手动编辑配置文件
- 📝 **所见即所得**：Markdown 编辑器，实时预览，支持手动调整 AI 生成内容
- 💾 **本地优先**：所有数据保存在本地，无需担心隐私泄露
- 🎯 **短剧专精**：专为 80-100 集竖屏短剧设计的结构化工作流
- 📚 **独创 DTG 理论**：基于深度的短剧创作方法论，确保剧情的紧凑与爽感

---

## 📚 DTG 短剧理论体系

本项目不仅仅是一个工具，更是 **DTG (Drama-Target-Grip)** 短剧创作理论的实践载体。我们构建了一套完整的理论框架来指导 AI 生成高质量剧本：

### 核心理论文档 (`/docs`)
1. **DTG 理论核心**：解析短剧创作的底层逻辑
2. **瞬时 DTG 与时序 DTG 模型**：如何构建即时爽点与长期剧情张力
3. **标签库体系**：基于 DTG 视角的短剧看点标签库
4. **心理学整合**：DTG 与三大心理学理论的融合应用
5. **冲突写作**：短剧冲突台词的写作核心经验
6. **通用架构**：标准化的短剧结构模板
7. **Prompt 体系**：从集纲到正文的专用提示词工程

> 💡 即使不使用本工具，阅读 `docs/` 下的理论文档也能极大提升你对短剧创作的理解！

---

## 🎬 六大创作阶段

| 阶段 | 名称 | 说明 |
|:---:|:---|:---|
| **Stage 1** | 创意孵化 | 输入你的创意点子，AI 帮你生成故事梗概、人物设定、世界观以及 8 张"故事卡片"大纲 |
| **Stage 2** | 结构构建 | 将 8 张卡片展开为详细的分集大纲（每卡约 10-12 集），确定每集的核心事件 |
| **Stage 3** | 分场编写 | 为每一集生成场次划分，包括场景、人物、冲突点等要素 |
| **Stage 4** | 剧本撰写 | AI 根据分场大纲，生成完整的对白剧本初稿 |
| **Stage 5** | 润色优化 | 批量优化剧本的对白风格、节奏感、情感张力 |
| **Stage 6** | 剧本医生 | 最终审稿阶段，逐集精修，支持自定义指令微调 |

> 💡 你也可以跳过前几个阶段，直接导入已有剧本到 Stage 4，让 AI 帮你润色和优化！

---

## 🛠️ 环境要求

- **Python** 3.10 或更高版本（推荐 3.12）
- **Node.js** 18 或更高版本
- **API Key**：需要阿里云百炼的 API Key

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/你的用户名/script-factory-ai.git
cd script-factory-ai
```

### 2. 配置 API Key

复制环境变量示例文件并填入你的 API Key：

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```env
DASHSCOPE_API_KEY=你的阿里云百炼密钥
```

### 3. 安装依赖

**Windows 用户：** 双击运行 `install.bat`

**macOS/Linux 用户：** 运行安装脚本

```bash
chmod +x install.sh
./install.sh
```

### 4. 启动应用

**Windows 用户：** 双击运行 `start.bat`

**macOS/Linux 用户：** 运行启动脚本

```bash
chmod +x start.sh
./start.sh
```

打开浏览器访问：**http://127.0.0.1:3000**

---

## 📁 项目结构

```
script-factory-ai/
├── backend/              # FastAPI 后端
│   ├── api/              # API 路由
│   ├── services/         # 业务逻辑（各阶段处理）
│   ├── prompts/          # AI 提示词模板
│   ├── config/           # 模型配置
│   └── requirements.txt
├── frontend/             # Next.js 前端
│   ├── app/              # 页面（stage1-6）
│   ├── components/       # UI 组件
│   └── lib/              # 工具函数
├── install.bat           # Windows 安装脚本
├── start.bat             # Windows 启动脚本
└── README.md
```

---

## 🔧 配置说明

### API Key 与模型管理

启动应用后，访问侧边栏的 **API Keys** 和 **Models** 页面进行可视化配置：

- `/settings/keys` - 管理 API 密钥（阿里云百炼等）
- `/settings/models` - 管理模型配置（新增、编辑、删除）

也可以手动编辑配置文件：

- `backend/.env` - API 密钥
- `backend/config/models.yaml` - 模型配置

### 模型配置示例

**支持任何兼容 OpenAI 标准的 API！** 只需添加 `provider: openai` 和 `base_url` 即可接入：

```yaml
models:
  # 示例：接入自定义 OpenAI 兼容服务
  my-custom-model:
    provider: openai                      # 使用 OpenAI 兼容协议
    model_name: your-model-name           # 模型名称
    base_url: https://your-api-server.com # API 地址
    api_key_env: YOUR_API_KEY             # 环境变量名（在 .env 中配置）
    supports_cache: false
    description: "My Custom Model"
    pricing:
      input: 0.0    # 可选：用于成本估算
      output: 0.0
```

常见兼容服务：阿里云百炼（Qwen）、DeepSeek、Moonshot、智谱、零一万物、Ollama 本地部署等。

### 项目数据

所有项目数据保存在 `backend/projects/` 目录下，每个项目一个文件夹，纯 JSON 格式，可直接编辑或备份。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

---

<p align="center">
  <b>让 AI 成为你的编剧搭档，释放创意的无限可能 🌟</b>
</p>
