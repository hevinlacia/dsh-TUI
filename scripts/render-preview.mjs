#!/usr/bin/env node
/**
 * Static visual preview of the UI components.
 *
 * Boots a crafted TuiState and renders the Splash, a realistic chat (user/
 * assistant with thinking + a tool card), and the status footer via Ink
 * renderToString. Purely for eyeballing layout/colors — no runtime, no model,
 * no store.
 *
 * Usage: node scripts/render-preview.mjs
 */

import { renderToString } from 'ink'
import React from 'react'
import { Splash } from '../lib/ui/Splash.js'
import { MessageList } from '../lib/ui/MessageList.js'
import { StatusBar } from '../lib/ui/StatusBar.js'
import { NoticeLine } from '../lib/ui/NoticeLine.js'
import { initialState } from '../lib/events/reducer.js'

const now = Date.now()
const h = React.createElement
const frag = React.Fragment

/** A believable TuiState with a short conversation. */
function sampleState() {
  return {
    ...initialState('session-preview'),
    connection: 'connected',
    phase: 'idle',
    model: 'deepseek-v4-flash',
    effort: 'max',
    contextWindow: 1_000_000,
    tokens: { input: 9_100, output: 8_200, reasoning: 190 },
    turn: 2,
    step: 1,
    turnStartedAt: now - 45_000,
    items: [
      { kind: 'user', id: 'u1', text: 'hi', time: now - 48_000 },
      {
        kind: 'assistant',
        id: 'a1',
        text: '你好！👋 我是你的编码助手。有什么想做的吗？比如：\n\n- 写代码 / 修 bug / 重构项目\n- 查资料 / 做调研 / 写文档\n- 搭个新项目或小实验\n\n直接说需求就行。',
        thinking: '用户打了个招呼，这是寒暄。友好开场并提示可用能力就好，不需要调用工具。',
        pending: false,
        thinkingStartedAt: now - 45_000,
        usage: { inputTokens: 50, outputTokens: 82, reasoningTokens: 40 },
        time: now - 45_000,
      },
      { kind: 'user', id: 'u2', text: '帮我看看这个仓库的结构', time: now - 30_000 },
      {
        kind: 'tool',
        id: 't1',
        callId: 'c1',
        name: 'bash',
        args: '{"command": "ls -la"}',
        status: 'ok',
        output: 'drwxr-xr-x  src\n-rw-r--r--  package.json\n-rw-r--r--  tsconfig.json\n-rw-r--r--  README.md',
        time: now - 28_000,
      },
      {
        kind: 'assistant',
        id: 'a2',
        text: '这是一个标准 TypeScript 项目，包含 src/、package.json、tsconfig.json 和 README.md。',
        thinking: '先列出目录，再基于文件推断项目类型。',
        pending: false,
        thinkingStartedAt: now - 28_000,
        usage: { inputTokens: 9_050, outputTokens: 41, reasoningTokens: 150 },
        time: now - 26_000,
      },
    ],
  }
}

const state = sampleState()
const cwd = '/home/hevin/Developer/code/projects'
const gitBranch = 'main'

async function out(label, element) {
  console.log(`===== ${label} =====`)
  try {
    const text = await renderToString(element)
    console.log(text)
  } catch (error) {
    console.log(`[render failed] ${error instanceof Error ? error.message : String(error)}`)
  }
  console.log()
}

await out('SPLASH (empty chat)', h(Splash, { model: 'deepseek-v4-flash', effort: 'max', cwd, gitBranch }))
await out('CHAT', h(MessageList, { state, thinkingOpen: false }))
await out('NOTICE', h(NoticeLine, { state }))
await out('STATUS FOOTER', h(StatusBar, { state, cwd, gitBranch }))