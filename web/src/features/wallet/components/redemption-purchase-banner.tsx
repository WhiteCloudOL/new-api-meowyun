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
import { ArrowUpRight, Gift } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import redemptionPoster from '@/assets/wallet/redemption-poster.webp'
import { Button } from '@/components/ui/button'

export function RedemptionPurchaseBanner(props: { url: string }) {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t('Top up with a redemption code')}
      className='bg-primary/5 grid overflow-hidden rounded-xl border sm:grid-cols-[minmax(0,1fr)_16rem]'
    >
      <div className='flex min-w-0 flex-col items-start justify-center gap-3 p-5 sm:p-6'>
        <span className='text-primary flex items-center gap-1.5 text-xs font-medium'>
          <Gift className='size-3.5' aria-hidden='true' />
          MeowYunAPI
        </span>
        <h3 className='text-foreground text-lg font-semibold tracking-tight sm:text-xl'>
          {t('Top up with a redemption code')}
        </h3>
        <p className='text-muted-foreground max-w-md text-sm leading-relaxed'>
          {t(
            'Purchase a code in our store, then redeem it below to add funds to your wallet.'
          )}
        </p>
        <Button
          role='link'
          size='lg'
          className='mt-1 h-auto min-h-9 max-w-full whitespace-normal'
          render={
            <a href={props.url} target='_blank' rel='noopener noreferrer' />
          }
        >
          {t('Buy redemption codes')}
          <ArrowUpRight className='size-4' aria-hidden='true' />
        </Button>
      </div>
      <img
        src={redemptionPoster}
        alt=''
        width={1536}
        height={1024}
        loading='lazy'
        decoding='async'
        className='aspect-3/2 h-full w-full object-cover'
      />
    </section>
  )
}
