/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { BILLING_CACHE_VAR_MAP } from './billing-expr'

export const CACHE_MODE_TIMED = 'timed'
export const CACHE_MODE_GENERIC = 'generic'
export type CacheMode = typeof CACHE_MODE_TIMED | typeof CACHE_MODE_GENERIC

export type TierConditionInput = {
  var: 'p' | 'c' | 'len'
  op: '<' | '<=' | '>' | '>='
  value: number | string
}

export type TimeTierWindow = {
  startHour: number
  endHour: number
}

export type TimeTierCondition = {
  timezone: string
  windows: TimeTierWindow[]
}

export type VisualTier = {
  label: string
  conditions: TierConditionInput[]
  /** An advanced condition that cannot be represented by the basic inputs. */
  condition_expr?: string
  input_unit_cost: number
  output_unit_cost: number
  cache_mode: CacheMode
  cache_read_unit_cost?: number
  cache_create_unit_cost?: number
  cache_create_1h_unit_cost?: number
  image_unit_cost?: number
  image_output_unit_cost?: number
  audio_input_unit_cost?: number
  audio_output_unit_cost?: number
  [field: string]: unknown
}

export type VisualConfig = {
  tiers: VisualTier[]
}

export function getTierCacheMode(
  tier: Partial<VisualTier> | null | undefined
): CacheMode {
  if (tier?.cache_mode === CACHE_MODE_TIMED) return CACHE_MODE_TIMED
  if (tier?.cache_mode === CACHE_MODE_GENERIC) return CACHE_MODE_GENERIC
  return Number(tier?.cache_create_1h_unit_cost) > 0
    ? CACHE_MODE_TIMED
    : CACHE_MODE_GENERIC
}

export function normalizeVisualTier(
  tier: Partial<VisualTier> = {}
): VisualTier {
  return {
    label: tier.label ?? '',
    input_unit_cost: Number(tier.input_unit_cost) || 0,
    output_unit_cost: Number(tier.output_unit_cost) || 0,
    cache_mode: getTierCacheMode(tier),
    conditions: Array.isArray(tier.conditions) ? tier.conditions : [],
    ...tier,
    cache_read_unit_cost: Number(tier.cache_read_unit_cost) || 0,
    cache_create_unit_cost: Number(tier.cache_create_unit_cost) || 0,
    cache_create_1h_unit_cost: Number(tier.cache_create_1h_unit_cost) || 0,
    image_unit_cost: Number(tier.image_unit_cost) || 0,
    image_output_unit_cost: Number(tier.image_output_unit_cost) || 0,
    audio_input_unit_cost: Number(tier.audio_input_unit_cost) || 0,
    audio_output_unit_cost: Number(tier.audio_output_unit_cost) || 0,
  }
}

export function createDefaultVisualConfig(): VisualConfig {
  return {
    tiers: [
      normalizeVisualTier({
        conditions: [],
        input_unit_cost: 0,
        output_unit_cost: 0,
        label: 'base',
        cache_mode: CACHE_MODE_GENERIC,
      }),
    ],
  }
}

export function normalizeVisualConfig(
  config: VisualConfig | null | undefined
): VisualConfig {
  if (!config || !Array.isArray(config.tiers) || config.tiers.length === 0) {
    return createDefaultVisualConfig()
  }
  return {
    ...config,
    tiers: config.tiers.map((tier) => normalizeVisualTier(tier)),
  }
}

function buildConditionStr(conditions: TierConditionInput[]): string {
  if (!conditions || conditions.length === 0) return ''
  return conditions
    .filter((c) => c.var && c.op && c.value != null && c.value !== '')
    .map((c) => `${c.var} ${c.op} ${c.value}`)
    .join(' && ')
}

function buildVisualTierCondition(tier: VisualTier): string {
  const advancedCondition = tier.condition_expr?.trim()
  if (advancedCondition) return advancedCondition
  return buildConditionStr(tier.conditions)
}

const TIME_TIER_WINDOW_RE =
  /hour\(\s*(["'])([^"']+)\1\s*\)\s*>=\s*(\d{1,2})\s*(&&|\|\|)\s*hour\(\s*(["'])([^"']+)\5\s*\)\s*<\s*(\d{1,2})/g

export function parseTimeTierCondition(
  conditionExpr: string | null | undefined
): TimeTierCondition | null {
  if (!conditionExpr?.trim()) return null

  const windows: TimeTierWindow[] = []
  let timezone = ''
  let match: RegExpExecArray | null
  TIME_TIER_WINDOW_RE.lastIndex = 0

  while ((match = TIME_TIER_WINDOW_RE.exec(conditionExpr)) !== null) {
    const currentTimezone = match[2].trim()
    const repeatedTimezone = match[6].trim()
    const startHour = Number(match[3])
    const operator = match[4]
    const endHour = Number(match[7])

    if (
      !currentTimezone ||
      currentTimezone !== repeatedTimezone ||
      (timezone && timezone !== currentTimezone) ||
      !Number.isInteger(startHour) ||
      !Number.isInteger(endHour) ||
      startHour < 0 ||
      startHour > 23 ||
      endHour < 0 ||
      endHour > 24 ||
      startHour === endHour ||
      (startHour < endHour && operator !== '&&') ||
      (startHour > endHour && operator !== '||')
    ) {
      return null
    }

    timezone = currentTimezone
    windows.push({ startHour, endHour })
  }

  if (windows.length === 0) return null

  TIME_TIER_WINDOW_RE.lastIndex = 0
  const remaining = conditionExpr
    .replaceAll(TIME_TIER_WINDOW_RE, '__window__')
    .replaceAll(/[()\s]/g, '')
  if (!/^__window__(?:\|\|__window__)*$/.test(remaining)) return null

  return { timezone, windows }
}

export function buildTimeTierCondition(condition: TimeTierCondition): string {
  const timezone = condition.timezone.trim() || 'UTC'
  const quotedTimezone = JSON.stringify(timezone)
  const windows = condition.windows.filter(
    ({ startHour, endHour }) =>
      Number.isInteger(startHour) &&
      Number.isInteger(endHour) &&
      startHour >= 0 &&
      startHour <= 23 &&
      endHour >= 0 &&
      endHour <= 24 &&
      startHour !== endHour
  )

  if (windows.length === 0) return ''

  const parts = windows.map(({ startHour, endHour }) => {
    const operator = startHour < endHour ? '&&' : '||'
    return `(hour(${quotedTimezone}) >= ${startHour} ${operator} hour(${quotedTimezone}) < ${endHour})`
  })
  return `(${parts.join(' || ')})`
}

function buildTierBodyExpr(tier: VisualTier): string {
  const parts: string[] = []
  const ic = Number(tier.input_unit_cost) || 0
  const oc = Number(tier.output_unit_cost) || 0
  parts.push(`p * ${ic}`)
  parts.push(`c * ${oc}`)
  for (const cv of BILLING_CACHE_VAR_MAP) {
    const v = Number((tier as Record<string, unknown>)[cv.field]) || 0
    if (v !== 0) parts.push(`${cv.exprVar} * ${v}`)
  }
  return parts.join(' + ')
}

export function generateExprFromVisualConfig(
  config: VisualConfig | null | undefined
): string {
  if (!config || !config.tiers || config.tiers.length === 0) {
    return 'p * 0 + c * 0'
  }
  const tiers = config.tiers

  if (tiers.length === 1) {
    const tier = tiers[0]
    const label = tier.label || 'default'
    const body = `tier("${label}", ${buildTierBodyExpr(tier)})`
    const cond = buildVisualTierCondition(tier)
    if (cond) {
      return `${cond} ? ${body} : p * 0 + c * 0`
    }
    return body
  }

  const parts: string[] = []
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    const label = tier.label || `tier_${i + 1}`
    const body = `tier("${label}", ${buildTierBodyExpr(tier)})`
    const cond = buildVisualTierCondition(tier)

    if (i < tiers.length - 1 && cond) {
      parts.push(`${cond} ? ${body}`)
    } else {
      parts.push(body)
    }
  }
  return parts.join(' : ')
}

export function tryParseVisualConfig(
  exprStr: string | null | undefined
): VisualConfig | null {
  if (!exprStr) return null
  try {
    let body = exprStr
    const versionMatch = body.match(/^v\d+:([\s\S]*)$/)
    if (versionMatch) body = versionMatch[1]
    const cacheVarNames = BILLING_CACHE_VAR_MAP.map((cv) => cv.exprVar)
    const optCacheStr = cacheVarNames
      .map((v) => `(?:\\s*\\+\\s*${v}\\s*\\*\\s*([\\d.eE+-]+))?`)
      .join('')

    const bodyPat = `p\\s*\\*\\s*([\\d.eE+-]+)\\s*\\+\\s*c\\s*\\*\\s*([\\d.eE+-]+)${optCacheStr}`

    const singleRe = new RegExp(`^tier\\("([^"]*)",\\s*${bodyPat}\\)$`)

    const parseTier = (value: string): VisualTier | null => {
      const match = value.trim().match(singleRe)
      if (!match) return null
      const tier: Record<string, unknown> = {
        conditions: [],
        input_unit_cost: Number(match[2]),
        output_unit_cost: Number(match[3]),
        label: match[1],
      }
      BILLING_CACHE_VAR_MAP.forEach((cv, i) => {
        const cacheValue = match[4 + i]
        if (cacheValue != null) tier[cv.field] = Number(cacheValue)
      })
      return normalizeVisualTier(tier as Partial<VisualTier>)
    }

    const splitTopLevelTernary = (value: string) => {
      let depth = 0
      let questionIndex = -1
      let quote = ''
      for (let i = 0; i < value.length; i += 1) {
        const char = value[i]
        if (quote) {
          if (char === quote && value[i - 1] !== '\\') quote = ''
          continue
        }
        if (char === '"' || char === "'") {
          quote = char
          continue
        }
        if (char === '(') {
          depth += 1
          continue
        }
        if (char === ')') {
          depth -= 1
          continue
        }
        if (depth === 0 && char === '?' && questionIndex < 0) {
          questionIndex = i
          continue
        }
        if (depth === 0 && char === ':' && questionIndex >= 0) {
          return {
            condition: value.slice(0, questionIndex).trim(),
            whenTrue: value.slice(questionIndex + 1, i).trim(),
            whenFalse: value.slice(i + 1).trim(),
          }
        }
      }
      return null
    }

    const ternary = splitTopLevelTernary(body)
    if (ternary) {
      const whenTrue = parseTier(ternary.whenTrue)
      const whenFalse = parseTier(ternary.whenFalse)
      if (whenTrue && whenFalse && ternary.condition) {
        whenTrue.condition_expr = ternary.condition
        return normalizeVisualConfig({ tiers: [whenTrue, whenFalse] })
      }
    }

    const simple = body.match(singleRe)
    if (simple) {
      const tier: Record<string, unknown> = {
        conditions: [],
        input_unit_cost: Number(simple[2]),
        output_unit_cost: Number(simple[3]),
        label: simple[1],
      }
      BILLING_CACHE_VAR_MAP.forEach((cv, i) => {
        const val = simple[4 + i]
        if (val != null) tier[cv.field] = Number(val)
      })
      return normalizeVisualConfig({
        tiers: [normalizeVisualTier(tier as Partial<VisualTier>)],
      })
    }

    const condGroup =
      `((?:(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+)` +
      `(?:\\s*&&\\s*(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+)*)`
    const tierRe = new RegExp(
      `(?:${condGroup}\\s*\\?\\s*)?tier\\("([^"]*)",\\s*${bodyPat}\\)`,
      'g'
    )
    const tiers: VisualTier[] = []
    let match: RegExpExecArray | null
    while ((match = tierRe.exec(body)) !== null) {
      const condStr = match[1] || ''
      const conditions: TierConditionInput[] = []
      if (condStr) {
        for (const cp of condStr.split(/\s*&&\s*/)) {
          const cm = cp.trim().match(/^(p|c|len)\s*(<|<=|>|>=)\s*([\d.eE+]+)$/)
          if (cm) {
            conditions.push({
              var: cm[1] as TierConditionInput['var'],
              op: cm[2] as TierConditionInput['op'],
              value: Number(cm[3]),
            })
          }
        }
      }
      const tier: Record<string, unknown> = {
        conditions,
        input_unit_cost: Number(match[3]),
        output_unit_cost: Number(match[4]),
        label: match[2],
      }
      const m = match
      BILLING_CACHE_VAR_MAP.forEach((cv, i) => {
        const val = m[5 + i]
        if (val != null) tier[cv.field] = Number(val)
      })
      tiers.push(normalizeVisualTier(tier as Partial<VisualTier>))
    }
    if (tiers.length === 0) return null

    const cfg = normalizeVisualConfig({ tiers })
    const regenerated = generateExprFromVisualConfig(cfg)
    if (regenerated.replaceAll(/\s+/g, '') !== body.replaceAll(/\s+/g, '')) {
      return null
    }
    return cfg
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Local cost evaluator (for the estimator preview)
// ---------------------------------------------------------------------------

const ESTIMATOR_VARS = [
  { var: 'cr', stateKey: 'cacheReadTokens' },
  { var: 'cc', stateKey: 'cacheCreateTokens' },
  { var: 'cc1h', stateKey: 'cacheCreate1hTokens' },
  { var: 'img', stateKey: 'imageTokens' },
  { var: 'img_o', stateKey: 'imageOutputTokens' },
  { var: 'ai', stateKey: 'audioInputTokens' },
  { var: 'ao', stateKey: 'audioOutputTokens' },
] as const

export type ExtraTokenValues = Record<
  (typeof ESTIMATOR_VARS)[number]['stateKey'],
  number
>

export type EvalResult = {
  cost: number
  matchedTier: string
  error: string | null
}

type TimeParts = {
  hour: number
  minute: number
  weekday: number
  month: number
  day: number
}

function getUtcTimeParts(now: Date): TimeParts {
  return {
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
    weekday: now.getUTCDay(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  }
}

function getTimePartsInZone(timezone: string, now: Date): TimeParts {
  const normalizedTimezone = timezone.trim()
  if (!normalizedTimezone) return getUtcTimeParts(now)

  try {
    const parts = new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
      timeZone: normalizedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)])
    )
    const year = values.year
    const month = values.month
    const day = values.day
    const hour = values.hour
    const minute = values.minute

    if (![year, month, day, hour, minute].every(Number.isFinite)) {
      return getUtcTimeParts(now)
    }

    return {
      hour,
      minute,
      weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
      month,
      day,
    }
  } catch {
    return getUtcTimeParts(now)
  }
}

export function evalExprLocally(
  exprStr: string,
  promptTokens: number,
  completionTokens: number,
  extraTokenValues: ExtraTokenValues,
  now = new Date()
): EvalResult {
  try {
    if (!exprStr || !exprStr.trim()) {
      return { cost: 0, matchedTier: '', error: null }
    }
    let matchedTier = ''
    const tierFn = (name: string, value: number) => {
      matchedTier = name
      return value
    }
    const cacheReadTokens = extraTokenValues.cacheReadTokens || 0
    const cacheCreateTokens = extraTokenValues.cacheCreateTokens || 0
    const cacheCreate1hTokens = extraTokenValues.cacheCreate1hTokens || 0
    const len =
      promptTokens + cacheReadTokens + cacheCreateTokens + cacheCreate1hTokens
    const timePartsByZone = new Map<string, TimeParts>()
    const timeParts = (timezone: string) => {
      const normalizedTimezone = String(timezone ?? '').trim()
      const cacheKey = normalizedTimezone || 'UTC'
      const cached = timePartsByZone.get(cacheKey)
      if (cached) return cached
      const value = getTimePartsInZone(normalizedTimezone, now)
      timePartsByZone.set(cacheKey, value)
      return value
    }
    const env: Record<string, unknown> = {
      p: promptTokens,
      c: completionTokens,
      len,
      tier: tierFn,
      max: Math.max,
      min: Math.min,
      abs: Math.abs,
      ceil: Math.ceil,
      floor: Math.floor,
      hour: (timezone: string) => timeParts(timezone).hour,
      minute: (timezone: string) => timeParts(timezone).minute,
      weekday: (timezone: string) => timeParts(timezone).weekday,
      month: (timezone: string) => timeParts(timezone).month,
      day: (timezone: string) => timeParts(timezone).day,
    }
    for (const field of ESTIMATOR_VARS) {
      env[field.var] = extraTokenValues[field.stateKey] || 0
    }
    const fn = new Function(
      ...Object.keys(env),
      `"use strict"; return (${exprStr});`
    )
    const cost = Number(fn(...Object.values(env))) || 0
    return { cost, matchedTier, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { cost: 0, matchedTier: '', error: message }
  }
}

export function exprUsesExtraVars(exprStr: string): boolean {
  if (!exprStr) return false
  const varNames = ESTIMATOR_VARS.map((f) => f.var).join('|')
  return new RegExp(`\\b(${varNames})\\b`).test(exprStr)
}

export const ESTIMATOR_EXTRA_FIELDS = ESTIMATOR_VARS
