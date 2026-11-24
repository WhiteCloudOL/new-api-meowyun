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
import { Activity, BarChart3, PawPrint, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber, formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  const stats: {
    label: string
    value: string
    description: string
    icon: typeof WalletCards
    tone: IconBadgeTone
  }[] = [
    {
      label: t('Current Balance'),
      value: formatQuota(props.user?.quota ?? 0),
      description: t('Remaining quota'),
      icon: WalletCards,
      tone: 'primary',
    },
    {
      label: t('Total Usage'),
      value: formatQuota(props.user?.used_quota ?? 0),
      description: t('Total consumed quota'),
      icon: BarChart3,
      tone: 'info',
    },
    {
      label: t('API Requests'),
      value: formatNumber(props.user?.request_count ?? 0),
      description: t('Total requests made'),
      icon: Activity,
      tone: 'chart-4',
    },
  ]

  return (
    <div className='wallet-stats'>
      {stats.map((item, index) => (
        <Card
          key={item.label}
          data-card-hover='false'
          className='wallet-stat'
          aria-busy={props.loading}
        >
          {index === 0 && (
            <PawPrint className='wallet-watermark' aria-hidden='true' />
          )}
          <div className='relative flex items-center gap-2'>
            <IconBadge tone={item.tone} className='rounded-full'>
              <item.icon />
            </IconBadge>
            <span className='text-sm font-medium'>{item.label}</span>
          </div>
          {props.loading ? (
            <Skeleton className='my-1 h-8 w-24 max-w-full' />
          ) : (
            <strong className='wallet-stat-value'>{item.value}</strong>
          )}
          <span className='text-muted-foreground relative text-xs'>
            {item.description}
          </span>
        </Card>
      ))}
    </div>
  )
}
