// Supabase Edge Function: generate-review
// 使用 Groq 或 OpenAI API 进行 writing expansion
// Paper 内容从前端传入（本地 papers.json 读取）

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 通过 API_VERSION 环境变量决定使用哪个后端: "openai" | "groq" | "cerebras"
const API_VERSION = (Deno.env.get('API_VERSION')).toLowerCase()
const API_KEY = Deno.env.get('API_KEY')

// 生成方式: "baseline" | "uncertainty"
const GENERATION_MODE = (Deno.env.get('GENERATION_MODE') || 'baseline').toLowerCase()

// 是否并行调用 API（受 rate limit 影响时可设为 "false"）
const PARALLEL_API_CALLS = (Deno.env.get('PARALLEL_API_CALLS') || 'true').toLowerCase() === 'true'

// Uncertainty 采样用的固定 seeds
const SAMPLING_SEEDS = [2266, 105, 86379]

const API_CONFIGS: Record<string, { baseUrl: string; model: string }> = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-nano",
  },
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    model: "llama3.1-8b",
  },
}

const apiConfig = API_CONFIGS[API_VERSION]
if (!apiConfig) {
  throw new Error(`Unsupported API_VERSION: "${API_VERSION}". Supported: ${Object.keys(API_CONFIGS).join(', ')}`)
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ACL Review Guidelines
const REVIEW_GUIDELINES = `
**Review Guideline**

**Strengths**
What are the major reasons to publish this paper at a selective *ACL venue? These could include novel and useful methodology, insightful empirical results or theoretical analysis, clear organization of related literature, or any other reason why interested readers of *ACL papers may find the paper useful.

**Weaknesses**
What are the concerns that you have about the paper that would cause you to favor prioritizing other high-quality papers that are also under consideration for publication? These could include concerns about correctness of the results or argumentation, limited perceived impact of the methods or findings (note that impact can be significant both in broad or in narrow sub-fields), lack of clarity in exposition, or any other reason why interested readers of *ACL papers may gain less from this paper than they would from other papers under consideration.

**Comments/Suggestions/Typos**
If you have any comments to the authors about how they may improve their paper, other than addressing the concerns above, please list them here.
`

// 共享参数类型
interface GenerateParams {
  paperContent: string
  previousRounds: any[]
  judgment: string
  feedback: string
  textSnippet: string
  temperature: number
  seed: number
}

// 共享：调用 LLM API
async function callLLM(systemPrompt: string, userPrompt: string, temperature: number, seed: number) {
  const systemRole = API_VERSION === 'openai' ? 'developer' : 'system'

  const requestBody: Record<string, any> = {
    model: apiConfig.model,
    messages: [
      { role: systemRole, content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  }

  if (API_VERSION === 'openai') {
    requestBody.max_completion_tokens = 4096
    requestBody.reasoning_effort = 'medium'
  } else if (API_VERSION === 'cerebras') {
    requestBody.max_completion_tokens = 500
    requestBody.seed = seed
    requestBody.logprobs = true
    requestBody.top_logprobs = 10
  } else {
    requestBody.max_tokens = 500
    requestBody.temperature = temperature
  }

  const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`${API_VERSION} API error:`, response.status, errorText)
    throw new Error(JSON.stringify({ error: `${API_VERSION} API error`, details: errorText }))
  }

  return await response.json()
}

// ============================================================
// Baseline 生成方式：一次调用生成三个有区分度的 candidates
// ============================================================
async function handleBaseline(params: GenerateParams): Promise<Response> {
  const { paperContent, previousRounds, judgment, feedback, textSnippet, temperature, seed } = params

  const systemPrompt = `You are an expert peer reviewer assistant. Your task is to help expand a single review point (judgment) into a well-written review comment by generating THREE diverse candidates.

IMPORTANT GUIDELINES:
1. The user provides ONE judgment point (either a strength, weakness, or a suggestion of the paper).
2. The user may also provide a text snippet extracted from the paper as relevant context for their judgment point.
3. Your job is to:
   (a) First, analyze the judgment point and identify 3 different angles/aspects to approach it.
   (b) Then, generate THREE distinct candidates, each focusing on a different angle.
4. Each candidate should be a CONCISE expansion of the judgment point, typically 2-3 sentences that form a focused review point. Not too brief to be vague, not too lengthy to overwhelm the reader.
5. The three candidates MUST have clear differentiation; they should explore different aspects, emphasize different points, or use different reasoning, based on the same core judgment.
6. Follow the provided review guidelines.
7. Output should be in this EXACT format:
   CANDIDATE 1: [first expansion focusing on angle 1]

   CANDIDATE 2: [second expansion focusing on angle 2]

   CANDIDATE 3: [third expansion focusing on angle 3]

${REVIEW_GUIDELINES}`

  let userPrompt = ''

  if (!previousRounds || previousRounds.length === 0) {
    userPrompt = `Paper content:
${paperContent}

---
${textSnippet ? `
Text snippet from the paper (relevant context):
"${textSnippet}"

---
` : ''}
User's judgment point to expand: "${judgment}"

Please generate THREE diverse candidates for expanding this judgment point:
1. First, briefly identify 3 different angles or aspects to approach this judgment point.
2. Then, generate three distinct expansions, each exploring one angle.
3. Ensure the three candidates have clear differentiation while all being valid expansions of the same judgment.

Output format:
CANDIDATE 1: [expansion]

CANDIDATE 2: [expansion]

CANDIDATE 3: [expansion]`

  } else {
    const historyText = previousRounds.map((round: any, idx: number) => {
      let roundText = `Expansion ${idx + 1}: ${round.output}`
      if (round.status === 'rejected' && round.feedback) {
        roundText += `\n(User feedback: ${round.feedback})`
      }
      return roundText
    }).join('\n\n')

    userPrompt = `Paper content:
${paperContent}

---

Previous expansion attempts:
${historyText}

---
${textSnippet ? `
Text snippet from the paper (relevant context):
"${textSnippet}"

---
` : ''}
${judgment ? `User's updated judgment: "${judgment}"` : ''}
${feedback ? `User's feedback for improvement: "${feedback}"` : ''}

Please generate THREE improved and diverse candidates, addressing the user's feedback. Ensure the three candidates have clear differentiation while all addressing the feedback.

Output format:
CANDIDATE 1: [expansion]

CANDIDATE 2: [expansion]

CANDIDATE 3: [expansion]`
  }

  const data = await callLLM(systemPrompt, userPrompt, temperature, seed)
  const rawOutput = data.choices?.[0]?.message?.content || ''

  // 解析三个 candidates
  const candidate1Match = rawOutput.match(/CANDIDATE 1:\s*([\s\S]*?)(?=CANDIDATE 2:|$)/i)
  const candidate2Match = rawOutput.match(/CANDIDATE 2:\s*([\s\S]*?)(?=CANDIDATE 3:|$)/i)
  const candidate3Match = rawOutput.match(/CANDIDATE 3:\s*([\s\S]*?)$/i)

  if (!candidate1Match || !candidate2Match || !candidate3Match) {
    console.error('Failed to parse candidates from output:', rawOutput)
    return new Response(
      JSON.stringify({ error: 'Failed to parse candidates from LLM output', rawOutput }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const candidates = [
    { text: cleanText(candidate1Match[1]), temperature },
    { text: cleanText(candidate2Match[1]), temperature },
    { text: cleanText(candidate3Match[1]), temperature }
  ]

  const responseBody: Record<string, any> = { candidates }

  if (API_VERSION === 'cerebras') {
    responseBody.logprobs = data.choices?.[0]?.logprobs || null
    responseBody.top_logprobs = data.choices?.[0]?.top_logprobs || null
  }

  return new Response(
    JSON.stringify(responseBody),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// 清理模型输出中多余的 markdown 格式符号（**）
function cleanText(text: string): string {
  return text
    .replace(/^\s*\*+\s*/gm, '')                      // 去掉每行开头的 **
    .replace(/\s*\*+\s*$/gm, '')                      // 去掉每行结尾的 **
    .replace(/^\s*CANDIDATE\s*\d+\s*:\s*/i, '')       // 去掉开头的 CANDIDATE N:
    .trim()
}

// ============================================================
// Uncertainty 计算工具函数
// ============================================================

interface UncertaintyScores {
  u1_avg_nll: number        // 平均 NLL (length-normalized)
  u1_perplexity: number     // exp(avg NLL)
  u2_mean_entropy: number   // mean token entropy (top-k 近似 + tail lump)
  u3_msp: number            // 1 - P(y|x), length-normalized 版本
  seq_logprob: number       // 序列总 logprob
  length: number            // 生成 token 数
}

function computeUncertainty(logprobs: any, topLogprobs: any): UncertaintyScores {
  // logprobs: 每个生成 token 的 logprob 数组
  // topLogprobs: 每个 token 位置的 top-k candidates 数组

  const tokenLogprobs: number[] = Array.isArray(logprobs) ? logprobs : []
  const tokenTopLogprobs: any[][] = Array.isArray(topLogprobs) ? topLogprobs : []

  const L = tokenLogprobs.length
  if (L === 0) {
    return { u1_avg_nll: 0, u1_perplexity: 1, u2_mean_entropy: 0, u3_msp: 0, seq_logprob: 0, length: 0 }
  }

  // U₁: 平均 NLL & Perplexity
  const seqLogprob = tokenLogprobs.reduce((sum, lp) => sum + lp, 0)
  const avgNLL = -seqLogprob / L
  const perplexity = Math.exp(avgNLL)

  // U₂: mean token entropy (top-k 近似 + tail lump)
  let totalEntropy = 0
  for (let t = 0; t < L; t++) {
    const topK = tokenTopLogprobs[t]
    if (!topK || !Array.isArray(topK) || topK.length === 0) {
      // 没有 top-k 数据，用当前 token 的 logprob 做退化估计
      const p = Math.exp(tokenLogprobs[t])
      totalEntropy += -p * Math.log(p) - (1 - p) * Math.log(1 - p + 1e-30)
      continue
    }

    // 将 top-k 的 logprobs 转换为概率
    const topKProbs = topK.map((entry: any) => Math.exp(entry.logprob ?? entry))
    const massTopK = topKProbs.reduce((s: number, p: number) => s + p, 0)
    const tailMass = Math.max(0, 1 - massTopK)

    // top-k 部分的熵
    let Ht = 0
    for (const p of topKProbs) {
      if (p > 0) Ht -= p * Math.log(p)
    }
    // tail lump 部分的熵
    if (tailMass > 1e-30) {
      Ht -= tailMass * Math.log(tailMass)
    }

    totalEntropy += Ht
  }
  const meanEntropy = totalEntropy / L

  // U₃: MSP (length-normalized)
  // P_norm(y|x) = exp(seqLogprob / L) = exp(-avgNLL)
  const normalizedProb = Math.exp(seqLogprob / L)
  const msp = 1 - normalizedProb

  return {
    u1_avg_nll: avgNLL,
    u1_perplexity: perplexity,
    u2_mean_entropy: meanEntropy,
    u3_msp: msp,
    seq_logprob: seqLogprob,
    length: L,
  }
}

// 并行/串行调用控制
async function executeCalls<T>(callFns: (() => Promise<T>)[]): Promise<T[]> {
  if (PARALLEL_API_CALLS) {
    return Promise.all(callFns.map(fn => fn()))
  }
  const results: T[] = []
  for (const fn of callFns) {
    results.push(await fn())
  }
  return results
}

// 从同一 angle 的多个 samples 中，选出 U₁-U₃ 聚合最低的 candidate
// 方法：min-max normalize 每个指标到 [0,1]，等权平均，取最小
function pickBestCandidateIndex(samples: UncertaintyScores[]): number {
  if (samples.length <= 1) return 0

  const normalize = (arr: number[]): number[] => {
    const min = Math.min(...arr)
    const max = Math.max(...arr)
    const range = max - min
    if (range < 1e-10) return arr.map(() => 0)
    return arr.map(v => (v - min) / range)
  }

  const n1 = normalize(samples.map(s => s.u1_avg_nll))
  const n2 = normalize(samples.map(s => s.u2_mean_entropy))
  const n3 = normalize(samples.map(s => s.u3_msp))

  const combined = samples.map((_, i) => (n1[i] + n2[i] + n3[i]) / 3)
  return combined.indexOf(Math.min(...combined))
}

// ============================================================
// Uncertainty-based 生成方式：Step1 提取 angles → Step2 per-angle 多次采样
// ============================================================
async function handleUncertainty(params: GenerateParams): Promise<Response> {
  const { paperContent, previousRounds, judgment, feedback, textSnippet, temperature, seed } = params

  // ========== Step 1: 提取 3 个 angles ==========
  const anglesSystemPrompt = `You are an expert peer reviewer assistant. Your task is to analyze a review point (judgment) and identify 3 distinct angles or aspects to approach it.
  

IMPORTANT:
1. Each angle should represent a clearly different perspective, emphasis, or reasoning approach.
2. Output ONLY the 3 angles in this EXACT format, each as a brief description (1 sentence):
   ANGLE 1: [description]
   ANGLE 2: [description]
   ANGLE 3: [description]`

  let anglesUserPrompt = ''

  if (!previousRounds || previousRounds.length === 0) {
    anglesUserPrompt = `Paper content:
${paperContent}

---
${textSnippet ? `
Text snippet from the paper (relevant context):
"${textSnippet}"

---
` : ''}
User's judgment point: "${judgment}"

Please identify 3 distinct angles or aspects to approach this judgment point.`

  } else {
    const historyText = previousRounds.map((round: any, idx: number) => {
      let roundText = `Expansion ${idx + 1}: ${round.output}`
      if (round.status === 'rejected' && round.feedback) {
        roundText += `\n(User feedback: ${round.feedback})`
      }
      return roundText
    }).join('\n\n')

    anglesUserPrompt = `Paper content:
${paperContent}

---

Previous expansion attempts:
${historyText}

---
${textSnippet ? `
Text snippet from the paper (relevant context):
"${textSnippet}"

---
` : ''}
${judgment ? `User's updated judgment: "${judgment}"` : ''}
${feedback ? `User's feedback for improvement: "${feedback}"` : ''}

Please identify 3 distinct angles or aspects to approach this judgment point, taking into account the user's feedback.`
  }

  const anglesData = await callLLM(anglesSystemPrompt, anglesUserPrompt, 0, seed)
  const anglesRaw = anglesData.choices?.[0]?.message?.content || ''

  const angle1Match = anglesRaw.match(/ANGLE 1:\s*([\s\S]*?)(?=ANGLE 2:|$)/i)
  const angle2Match = anglesRaw.match(/ANGLE 2:\s*([\s\S]*?)(?=ANGLE 3:|$)/i)
  const angle3Match = anglesRaw.match(/ANGLE 3:\s*([\s\S]*?)$/i)

  if (!angle1Match || !angle2Match || !angle3Match) {
    console.error('Failed to parse angles from output:', anglesRaw)
    return new Response(
      JSON.stringify({ error: 'Failed to parse angles from LLM output', rawOutput: anglesRaw }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const angles = [
    angle1Match[1].trim(),
    angle2Match[1].trim(),
    angle3Match[1].trim(),
  ]

  // ========== Step 2: 每个 angle × 3 seeds 采样 ==========
  const expandSystemPrompt = `You are an expert peer reviewer assistant. Your task is to help expand a single review point (judgment) into a well-written review comment, focusing on a specific angle provided.

IMPORTANT GUIDELINES:
1. The user provides ONE judgment point and a specific ANGLE to focus on.
2. The user may also provide a text snippet extracted from the paper as relevant context.
3. Generate a CONCISE expansion of the judgment point from the given angle, typically 2-3 sentences that form a focused review point.
4. Follow the provided review guidelines.
5. Output ONLY the expanded review comment, without any prefix or label.

${REVIEW_GUIDELINES}`

  // 构建 3 angles × 3 seeds = 9 个调用
  const callFns = angles.flatMap((angle, angleIdx) =>
    SAMPLING_SEEDS.map(s => () => {
      const userPrompt = !previousRounds || previousRounds.length === 0
        ? `Paper content:
${paperContent}

---
${textSnippet ? `
Text snippet from the paper (relevant context):
"${textSnippet}"

---
` : ''}
User's judgment point: "${judgment}"

Angle to focus on: "${angle}"

Please expand the judgment point from this specific angle. Output only the expanded review comment.`
        : `Paper content:
${paperContent}

---

Previous expansion attempts:
${previousRounds.map((round: any, idx: number) => {
  let roundText = `Expansion ${idx + 1}: ${round.output}`
  if (round.status === 'rejected' && round.feedback) {
    roundText += `\n(User feedback: ${round.feedback})`
  }
  return roundText
}).join('\n\n')}

---
${textSnippet ? `
Text snippet from the paper (relevant context):
"${textSnippet}"

---
` : ''}
${judgment ? `User's updated judgment: "${judgment}"` : ''}
${feedback ? `User's feedback for improvement: "${feedback}"` : ''}

Angle to focus on: "${angle}"

Please generate an improved expansion from this specific angle, addressing the user's feedback. Output only the expanded review comment.`

      return callLLM(expandSystemPrompt, userPrompt, temperature, s)
    })
  )

  const results = await executeCalls(callFns)

  // ========== Step 3: 计算 uncertainty，选出每个 angle 的最佳 candidate ==========
  const K = SAMPLING_SEEDS.length
  const angleResults = angles.map((angle, angleIdx) => {
    const angleSamples = results.slice(angleIdx * K, (angleIdx + 1) * K)

    const samples = angleSamples.map((data, sampleIdx) => {
      const text = cleanText(data.choices?.[0]?.message?.content || '')
      // OpenAI-compatible format: logprobs.content is an array of {logprob, top_logprobs}
      const logprobsContent = data.choices?.[0]?.logprobs?.content || null
      const logprobs = Array.isArray(logprobsContent) ? logprobsContent.map((item: any) => item.logprob) : null
      const topLogprobs = Array.isArray(logprobsContent) ? logprobsContent.map((item: any) => item.top_logprobs || []) : null
      const uncertainty = computeUncertainty(logprobs, topLogprobs)

      return {
        text,
        temperature,
        seed: SAMPLING_SEEDS[sampleIdx],
        uncertainty,
        raw_logprobs: logprobs,
        raw_top_logprobs: topLogprobs,
      }
    })

    // U₄ (MC-NSE) per angle
    const validSamples = samples.filter(s => s.uncertainty.length > 0)
    const u4_mc_nse = validSamples.length > 0
      ? validSamples.reduce((sum, s) => sum + s.uncertainty.u1_avg_nll, 0) / validSamples.length
      : 0

    // 选出 U₁-U₃ 聚合最低的 candidate 作为展示，并保留各 sample 的归一化聚合分
    const uncertaintyScores = samples.map(s => s.uncertainty)
    const bestIdx = pickBestCandidateIndex(uncertaintyScores)

    // 重新计算归一化分数，取出 best sample 对应的值（与选 best 时完全一致）
    const normalize = (arr: number[]): number[] => {
      const min = Math.min(...arr)
      const max = Math.max(...arr)
      const range = max - min
      if (range < 1e-10) return arr.map(() => 0)
      return arr.map(v => (v - min) / range)
    }
    const n1 = normalize(uncertaintyScores.map(s => s.u1_avg_nll))
    const n2 = normalize(uncertaintyScores.map(s => s.u2_mean_entropy))
    const n3 = normalize(uncertaintyScores.map(s => s.u3_msp))
    const combinedScores = uncertaintyScores.map((_, i) => (n1[i] + n2[i] + n3[i]) / 3)
    const u1_u3_agg = combinedScores[bestIdx]

    return {
      angle,
      samples,
      u4_mc_nse,
      best_sample_index: bestIdx,
      displayed_candidate: samples[bestIdx],
      u1_u3_agg,
    }
  })

  // 最终返回给前端的 candidates（每个 angle 的最佳 candidate）
  const candidates = angleResults.map(ar => ({
    text: ar.displayed_candidate.text,
    temperature: ar.displayed_candidate.temperature,
    seed: ar.displayed_candidate.seed,
    angle: ar.angle,
    uncertainty: ar.displayed_candidate.uncertainty,
    u1_u3_agg: ar.u1_u3_agg,
    u4_mc_nse: ar.u4_mc_nse,
  }))

  return new Response(
    JSON.stringify({
      candidates,
      angles_detail: angleResults,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { paperId, paperContent, previousRounds, judgment, feedback, textSnippet = '', temperature = 0.6, seed = 2266 } = await req.json()

    // 验证输入
    if (!paperContent) {
      return new Response(
        JSON.stringify({ error: 'paperContent is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!judgment && (!previousRounds || previousRounds.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'judgment is required for first round' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============================================================
    // 根据 GENERATION_MODE 分发到不同的生成流程
    // ============================================================

    if (GENERATION_MODE === 'baseline') {
      return await handleBaseline({ paperContent, previousRounds, judgment, feedback, textSnippet, temperature, seed })
    } else if (GENERATION_MODE === 'uncertainty') {
      return await handleUncertainty({ paperContent, previousRounds, judgment, feedback, textSnippet, temperature, seed })
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported GENERATION_MODE: "${GENERATION_MODE}". Supported: baseline, uncertainty` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
