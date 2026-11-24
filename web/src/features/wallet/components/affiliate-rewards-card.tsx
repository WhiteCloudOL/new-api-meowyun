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
import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber, formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface AffiliateRewardsCardProps {
  user: UserWalletData | null
  affiliateLink: string
  onTransfer: () => void
  complianceConfirmed?: boolean
  loading?: boolean
}

export function AffiliateRewardsCard({
  user,
  affiliateLink,
  onTransfer,
  complianceConfirmed = true,
  loading,
}: AffiliateRewardsCardProps) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <Card data-card-hover='false' className='wallet-referral py-0'>
        <CardContent className='grid gap-4 p-5'>
          <div>
            <Skeleton className='h-5 w-32' />
            <Skeleton className='mt-2 h-4 w-48' />
          </div>
          <Skeleton className='h-14 rounded-lg' />
          <Skeleton className='h-10 rounded-lg' />
        </CardContent>
      </Card>
    )
  }

  const hasRewards = (user?.aff_quota ?? 0) > 0

  return (
    <Card data-card-hover='false' className='wallet-referral py-0'>
      <CardContent className='wallet-referral-content grid gap-4 p-4 sm:p-5'>
        <div className='flex min-w-0 items-start gap-2.5'>
          <IconBadge tone='chart-3'>
            <Share2 />
          </IconBadge>
          <div className='min-w-0'>
            <h3 className='text-base font-semibold'>{t('Referral Program')}</h3>
            <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
              {t(
                'Earn rewards when users join through your referral link. Transfer accumulated rewards to your balance anytime.'
              )}
            </p>
          </div>
        </div>

        <div className='wallet-reward-pills'>
          {[
            [t('Pending'), formatQuota(user?.aff_quota ?? 0)],
            [t('Total Earned'), formatQuota(user?.aff_history_quota ?? 0)],
            [t('Invites'), formatNumber(user?.aff_count ?? 0)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className='text-muted-foreground text-xs font-medium'>
                {label}
              </div>
              <div className='mt-0.5 text-sm font-semibold break-all tabular-nums'>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className='wallet-share-row'>
          <Input
            value={affiliateLink}
            aria-label={t('Copy referral link')}
            readOnly
            className='h-9 min-w-0 rounded-full border-transparent bg-transparent font-mono text-xs shadow-none'
          />
          <CopyButton
            value={affiliateLink}
            variant='default'
            size='sm'
            className='wallet-berry h-9 shrink-0'
            iconClassName='size-4'
            tooltip={t('Copy referral link')}
            aria-label={t('Copy referral link')}
            successTooltip={t('Referral link copied!')}
          >
            {t('Copy Link')}
          </CopyButton>
        </div>
        {hasRewards && (
          <Button
            onClick={onTransfer}
            disabled={!complianceConfirmed}
            className='h-9 justify-self-start px-3'
            size='sm'
          >
            {t('Transfer to Balance')}
          </Button>
        )}
        {!complianceConfirmed ? (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Referral reward transfer is disabled until the administrator confirms compliance terms.'
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
