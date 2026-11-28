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
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { getUserQuotaDates } from '@/features/dashboard/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import {
  computeTimeRange,
  dateToUnixTimestamp,
  getStartOfDay,
} from '@/lib/time'

const ACCOUNT_HEALTH = {
  healthy: { dotClass: 'bg-success', labelKey: 'Healthy' },
  caution: { dotClass: 'bg-warning', labelKey: 'Low balance' },
  critical: { dotClass: 'bg-destructive', labelKey: 'Balance depleted' },
} as const

export function useOverviewUsage(
  remainQuota: number,
  userId: number | undefined
) {
  const [range] = useState(() => computeTimeRange(1))
  const todayStart = dateToUnixTimestamp(getStartOfDay())
  const start = Math.min(todayStart, range.start_timestamp)
  const end = range.end_timestamp
  const trend = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'summary-sparklines',
      userId,
      start,
      end,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: start,
          end_timestamp: end,
          default_time: 'hour',
        })
      ),
    enabled: userId !== undefined,
    staleTime: 60 * 1000,
  })

  const rows = trend.data?.data
  const hasTrendData = trend.data !== undefined
  const totals = useMemo(() => {
    const recentRows = (rows ?? []).filter(
      (item) => item.created_at >= range.start_timestamp
    )
    const recentUsage = recentRows.reduce(
      (total, item) => total + (Number(item.quota) || 0),
      0
    )
    const todayUsage = hasTrendData
      ? (rows ?? []).reduce(
          (total, item) =>
            total +
            (item.created_at >= todayStart ? Number(item.quota) || 0 : 0),
          0
        )
      : undefined
    return { recentRows, recentUsage, todayUsage }
  }, [rows, range.start_timestamp, todayStart, hasTrendData])

  const days = remainQuota / totals.recentUsage
  const runwayDays =
    remainQuota > 0 && totals.recentUsage > 0 && Number.isFinite(days)
      ? days
      : null

  let healthLevel: keyof typeof ACCOUNT_HEALTH = 'healthy'
  if (remainQuota <= 0) healthLevel = 'critical'
  else if (runwayDays !== null && runwayDays < 3) healthLevel = 'caution'

  return {
    ...totals,
    range,
    runwayDays,
    healthLevel,
    health: ACCOUNT_HEALTH[healthLevel],
    hasTrendData,
  }
}

export type OverviewUsage = ReturnType<typeof useOverviewUsage>
