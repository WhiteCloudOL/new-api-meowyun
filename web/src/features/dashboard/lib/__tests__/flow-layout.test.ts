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
import { sankeyLayout } from '@visactor/vchart/cjs/data/transforms/sankey'
import { describe, expect, test } from 'vitest'

import type { FlowMetric, FlowQuotaDataItem } from '../../types'
import { buildDashboardFlowData, buildFlowSankeySpec } from '../flow'

const freeSpeech: FlowQuotaDataItem[] = [
  {
    user_id: 1,
    username: 'alice',
    node_name: 'node-a',
    token_id: 11,
    token_name: 'AstrBot',
    use_group: 'default',
    model_name: 'breeze-tts-2',
    channel_id: 22,
    channel_name: 'BreezeTTS',
    quota: 0,
    token_used: 0,
    count: 3,
  },
  {
    user_id: 2,
    username: 'bob',
    node_name: 'node-a',
    token_id: 22,
    token_name: 'DSH',
    use_group: 'default',
    model_name: 'breeze-tts',
    channel_id: 22,
    channel_name: 'BreezeTTS',
    quota: 0,
    token_used: 0,
    count: 2,
  },
]

const paidChat: FlowQuotaDataItem = {
  ...freeSpeech[0],
  user_id: 3,
  username: 'carol',
  token_id: 33,
  token_name: 'chat',
  model_name: 'deepseek-v4.1-flash',
  channel_id: 24,
  channel_name: 'chat-provider',
  quota: 100,
  token_used: 50,
  count: 1,
}

describe('flow layout for free requests', () => {
  test.each([
    ['quota', false],
    ['tokens', false],
    ['requests', false],
    ['quota', true],
    ['tokens', true],
  ] as [FlowMetric, boolean][])(
    '%s with paid traffic=%s keeps users, tokens and one Breeze channel in their columns',
    (metric, includePaid) => {
      const rows = includePaid ? [...freeSpeech, paidChat] : freeSpeech
      const graph = buildDashboardFlowData(rows, metric, { role: 'root' })
      const spec = buildFlowSankeySpec(graph.flow, 'Flow')
      const layout = sankeyLayout(spec.data[0].values, {
        ...spec,
        sourceField: spec.sourceField,
        targetField: spec.targetField,
        valueField: spec.valueField,
        view: () => ({ x0: 0, x1: 1200, y0: 0, y1: 700 }),
      })[0]
      expect(layout).toBeDefined()
      if (!layout) throw new Error('Sankey layout is missing')

      const nodeKinds = new Map(
        graph.flow.nodes.map((node) => [node.id, node.kind])
      )
      expect(
        layout.columns.map((column) => [
          ...new Set(column.map((node) => nodeKinds.get(String(node.key)))),
        ])
      ).toEqual([
        ['user'],
        ['node'],
        ['token'],
        ['group'],
        ['model'],
        ['channel'],
      ])
      expect(
        layout.nodes.filter((node) => node.key === 'channel:22')
      ).toHaveLength(1)
      expect(
        layout.nodes.filter(
          (node) => node.key === 'user:1' || node.key === 'user:2'
        )
      ).toHaveLength(2)
      expect(layout.links).toHaveLength(graph.flow.links.length)
      for (const node of layout.nodes) {
        expect(
          [node.x0, node.x1, node.y0, node.y1].every(Number.isFinite)
        ).toBe(true)
      }
      for (const link of layout.links) {
        expect(Number.isFinite(link.thickness)).toBe(true)
        expect(link.thickness).toBeGreaterThan(0)
      }
      const speech = spec.data[0].values[0].nodes.find(
        (node: { key: string }) => node.key === 'channel:22'
      )
      expect(speech).toMatchObject({
        name: 'BreezeTTS',
        quota: 0,
        tokens: 0,
        requests: 5,
      })
      expect(graph.summary).toEqual({
        quota: includePaid ? 100 : 0,
        tokens: includePaid ? 50 : 0,
        requests: includePaid ? 6 : 5,
      })
    }
  )

  test('does not render disconnected nodes without any recorded activity', () => {
    const graph = buildDashboardFlowData(
      [{ ...freeSpeech[0], count: 0 }],
      'quota',
      { role: 'root' }
    )
    const spec = buildFlowSankeySpec(graph.flow, 'Flow')
    expect(spec.data[0].values[0]).toEqual({ nodes: [], links: [] })
  })
})
