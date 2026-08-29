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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  buildTimeTierCondition,
  evalExprLocally,
  parseTimeTierCondition,
  tryParseVisualConfig,
  type ExtraTokenValues,
} from '../tier-expr'

const proExpression =
  '((hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12) || (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18)) ? tier("peak", p * 9.1 + c * 27.1 + cr * 0.31) : tier("offpeak", p * 4.6 + c * 13.6 + cr * 0.16)'

const emptyExtras: ExtraTokenValues = {
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  cacheCreate1hTokens: 0,
  imageTokens: 0,
  imageOutputTokens: 0,
  audioInputTokens: 0,
  audioOutputTokens: 0,
}

describe('time-based tier expressions', () => {
  test('parses the complete peak/offpeak expression for the visual editor', () => {
    const visualConfig = tryParseVisualConfig(proExpression)

    assert.ok(visualConfig)
    assert.equal(visualConfig.tiers.length, 2)
    assert.equal(visualConfig.tiers[0].label, 'peak')
    assert.equal(
      visualConfig.tiers[0].condition_expr,
      proExpression.split(' ? ')[0]
    )
    assert.equal(visualConfig.tiers[1].label, 'offpeak')
    assert.equal(visualConfig.tiers[1].condition_expr, undefined)
  })

  test('parses and regenerates multiple peak windows', () => {
    const condition = proExpression.split(' ? ')[0]
    const parsed = parseTimeTierCondition(condition)

    assert.ok(parsed)
    assert.deepEqual(parsed, {
      timezone: 'Asia/Shanghai',
      windows: [
        { startHour: 9, endHour: 12 },
        { startHour: 14, endHour: 18 },
      ],
    })
    assert.equal(
      buildTimeTierCondition(parsed),
      '((hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12) || (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18))'
    )
  })

  test('evaluates the peak tier with the configured timezone', () => {
    const result = evalExprLocally(
      proExpression,
      1,
      1,
      emptyExtras,
      new Date('2026-08-29T02:00:00Z')
    )

    assert.equal(result.error, null)
    assert.equal(result.matchedTier, 'peak')
    assert.equal(result.cost, 36.2)
  })

  test('evaluates the fallback tier outside peak windows', () => {
    const result = evalExprLocally(
      proExpression,
      1,
      1,
      emptyExtras,
      new Date('2026-08-29T05:00:00Z')
    )

    assert.equal(result.error, null)
    assert.equal(result.matchedTier, 'offpeak')
    assert.equal(result.cost, 18.2)
  })
})
