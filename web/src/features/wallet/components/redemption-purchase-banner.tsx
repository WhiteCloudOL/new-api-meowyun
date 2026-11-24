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

import rechargeGift from '@/assets/wallet/recharge-gift.webp'
import { Button } from '@/components/ui/button'

export function RedemptionPurchaseBanner(props: { url: string }) {
  const { t } = useTranslation()

  return (
    <section
      aria-label={t('Top up with a redemption code')}
      className='wallet-gift-banner'
    >
      <div className='wallet-gift-copy'>
        <span className='wallet-step'>
          <Gift className='size-3.5' aria-hidden='true' />
          {t('Step 1 · Get a code')}
        </span>
        <h3 className='text-foreground text-lg font-semibold tracking-tight sm:text-xl'>
          {t('Top up with a redemption code')}
        </h3>
        <p className='text-muted-foreground max-w-md text-sm leading-relaxed'>
          {t('Redeem a store code to add funds to your wallet')}
        </p>
        <Button
          role='link'
          size='lg'
          className='wallet-berry mt-1 h-auto min-h-9 max-w-full whitespace-normal'
          render={
            <a href={props.url} target='_blank' rel='noopener noreferrer' />
          }
        >
          {t('Buy redemption codes')}
          <ArrowUpRight className='size-4' aria-hidden='true' />
        </Button>
      </div>
      <img
        src={rechargeGift}
        alt=''
        width={512}
        height={500}
        loading='lazy'
        decoding='async'
        className='wallet-gift-art object-contain object-bottom'
      />
    </section>
  )
}
