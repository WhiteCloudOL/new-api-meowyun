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
import { ChevronDown } from 'lucide-react'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'

import mascot from '@/assets/journal/overview-mascot.webp'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { OverviewUsage } from './use-overview-usage'

export function SetupGuideMascot({ className }: { className: string }) {
  return (
    <img
      src={mascot}
      alt=''
      width={576}
      height={526}
      decoding='async'
      className={cn('pointer-events-none select-none', className)}
    />
  )
}

type SetupGuideWelcomeProps = {
  balance: number
  todayUsage: number | undefined
  health: OverviewUsage['health']
  showHealth: boolean
  completed: number
  total: number
  guideId: string
  toggleRef: Ref<HTMLButtonElement>
  onExpand: () => void
}

export function SetupGuideWelcome(props: SetupGuideWelcomeProps) {
  const { t } = useTranslation()
  const hour = new Date().getHours()
  let greeting = t('Good evening')
  if (hour < 12) greeting = t('Good morning')
  else if (hour < 18) greeting = t('Good afternoon')

  const progress = t('Setup progress: {{completed}}/{{total}}', {
    completed: props.completed,
    total: props.total,
  })

  return (
    <section
      aria-label={greeting}
      className='from-card via-card to-primary/12 relative isolate flex min-h-[84px] w-full flex-col justify-center gap-1.5 overflow-hidden rounded-2xl border bg-linear-to-r py-2 ps-3 pe-23 md:min-h-[102px] md:flex-row md:items-center md:justify-between md:gap-4 md:ps-5 md:pe-35'
    >
      <div className='pointer-events-none absolute end-0 bottom-0 -z-10 h-[76px] w-20 overflow-hidden md:h-full md:w-32'>
        <SetupGuideMascot className='absolute inset-x-0 top-0 h-[138%] w-full object-cover object-top' />
      </div>
      <div className='min-w-0 space-y-1'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <h3 className='text-sm font-semibold md:text-lg'>{greeting}</h3>
          {props.showHealth && (
            <Badge
              variant='outline'
              className='bg-background/80 text-muted-foreground h-auto min-h-4 gap-1 px-1.5 py-0.5 text-[10px] leading-none whitespace-normal md:text-[11px]'
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  props.health.dotClass
                )}
                aria-hidden='true'
              />
              {t(props.health.labelKey)}
            </Badge>
          )}
        </div>
        <dl className='text-muted-foreground flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] md:gap-x-4 md:text-xs'>
          <div className='flex items-baseline gap-1'>
            <dt>{t('Balance')}</dt>
            <dd className='text-foreground font-medium tabular-nums'>
              {formatQuota(props.balance)}
            </dd>
          </div>
          <div className='flex items-baseline gap-1'>
            <dt>{t("Today's usage")}</dt>
            <dd className='text-foreground font-medium tabular-nums'>
              {props.todayUsage === undefined
                ? '—'
                : formatQuota(props.todayUsage)}
            </dd>
          </div>
        </dl>
      </div>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 md:justify-end'>
        <span
          title={progress}
          className='text-muted-foreground text-[11px] tabular-nums'
        >
          <span className='sr-only'>{progress}</span>
          <span aria-hidden='true'>
            {props.completed}/{props.total}
          </span>
        </span>
        <Button
          ref={props.toggleRef}
          variant='outline'
          size='sm'
          className='bg-background/80 h-auto min-h-6 rounded-full px-2 text-xs whitespace-normal md:min-h-8'
          aria-expanded={false}
          aria-controls={props.guideId}
          onClick={props.onExpand}
        >
          <ChevronDown data-icon='inline-start' />
          {t('Show setup guide')}
        </Button>
      </div>
    </section>
  )
}
