# AI Script Factory — Design Language

## Product Identity

AI Script Factory is an AI-native screenplay production workspace.

It is not an AI chatbot.
It is not a generic writing assistant.

It is a production system that transforms:

Idea → Structure → Scenes → Script → Polish → Doctor

## Design Philosophy

1. Production First
2. AI as Co-Producer
3. Context Before Conversation
4. Structured Creativity
5. Minimal Visual Noise
6. Reversible AI Actions
7. Every Stage Has a Clear Output

## Visual Direction

Keywords: Professional · Editorial · Precise · Calm · Cinematic · Intelligent · Production-oriented

References: Linear / Arc Studio / Final Draft / WriterDuet / Modern AI IDEs

Avoid: generic AI SaaS aesthetics, excessive gradients, excessive rounded cards, emoji UI,
purple-heavy interfaces, ChatGPT-like layouts.

## Layout

Sidebar → Project Navigation → Main Workspace → Contextual AI Panel.
AI is contextual, never permanently dominant.

## Color (implemented in `frontend/app/globals.css`)

| Token | Value |
|---|---|
| Background | #F7F7F5 |
| Surface | #FFFFFF |
| Border | #E8E8E5 |
| Primary Text | #18181A |
| Secondary Text | #71717A |
| AI Accent (primary) | #5B5BD6 |
| Success / Warning / Error | Green / Amber / Red (used sparingly) |

## Typography

- UI (Latin): Inter / SF Pro — via next/font (Geist as Inter-class stand-in)
- UI (Chinese): PingFang SC / Noto Sans SC (system stack)
- Script content: Noto Serif SC — utility class `font-script`

## Radius

Small 6px · Medium 8px · Large 12px (`--radius: 8px`; shadcn scale maps md=6, lg=8, xl=12).
Avoid excessive rounded UI.

## Components

Button, Input, Select, Dropdown, Dialog, Tabs, Card, Badge, Timeline,
Scene Card, Character Card, AI Suggestion, AI Diff, Progress, Version Item.

## AI Actions

Generate · Rewrite · Expand · Condense · Polish · Analyze · Fix · Apply · Regenerate

## AI States

Idle · Thinking · Generating · Analyzing · Reviewing · Complete · Error

## AI Interaction

AI must explain: what it changed, why it changed, what context it used.
AI changes should be: previewable, diffable, reversible.
Never silently overwrite user content — every AI revision takes a version snapshot first.

## Workflow

01 Idea Lab → 02 Structure → 03 Scene Writer → 04 Script Writer → 05 Polisher → 06 Script Doctor

Each stage: Input → AI Processing → Output.

## Navigation (information architecture)

```
PROJECT
├── Overview                    /
├── Production                  创作流程
│   ├── Idea Lab                /stage1
│   ├── Structure               /stage2
│   ├── Scene Writer            /stage3
│   ├── Script Writer           /stage4
│   ├── Polisher                /stage5
│   └── Script Doctor           /stage6
├── Story Bible                 故事圣经
│   ├── Characters              /bible/characters
│   ├── Relationships           /bible/relationships
│   ├── World                   /bible/world
│   ├── Timeline                /bible/timeline
│   └── Story Threads           /bible/threads
└── Tools                       工具
    ├── Rewrite Studio          /rewrite
    ├── Import                  /import
    ├── Version History         /versions
    └── Export                  /export
```

## Principle

The interface should feel like:
"An intelligent writers' room inside a professional production system."
Not: "ChatGPT with a screenplay theme."
