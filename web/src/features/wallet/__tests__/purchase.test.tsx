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
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import type { ComponentProps } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { RechargeFormCard } from '../components/recharge-form-card'

const storeUrl = 'https://store.example.com/redemption-codes'
const i18n = createInstance()
const topupInfo = {
  enable_online_topup: false,
  enable_stripe_topup: false,
  pay_methods: [],
  min_topup: 1,
  stripe_min_topup: 1,
  amount_options: [],
  discount: {},
}
const props: ComponentProps<typeof RechargeFormCard> = {
  topupInfo,
  topupLink: storeUrl,
  presetAmounts: [],
  selectedPreset: null,
  topupAmount: 1,
  paymentAmount: 1,
  calculating: false,
  paymentLoading: null,
  redemptionCode: '',
  redeeming: false,
  onSelectPreset: vi.fn(),
  onTopupAmountChange: vi.fn(),
  onPaymentMethodSelect: vi.fn(),
  onRedemptionCodeChange: vi.fn(),
  onRedeem: vi.fn(),
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
})

it('shows a safe keyboard-accessible store link when online topup is disabled and keeps code redemption available', async () => {
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard {...props} />
    </I18nextProvider>
  )
  const link = screen.getByRole('link', { name: '购买卡密' })
  expect(link).toHaveAttribute('href', storeUrl)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await user.tab()
  expect(link).toHaveFocus()
  const code = screen.getByRole('textbox', { name: i18n.t('Have a Code?') })
  fireEvent.change(code, { target: { value: 'TEST-CODE' } })
  expect(props.onRedemptionCodeChange).toHaveBeenCalledWith('TEST-CODE')
  await user.click(screen.getByRole('button', { name: '兑换额度' }))
  expect(props.onRedeem).toHaveBeenCalledOnce()
})

it('updates purchase copy when the interface language changes', async () => {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard {...props} />
    </I18nextProvider>
  )
  expect(screen.getByRole('region', { name: '卡密充值' })).toBeVisible()
  await act(() => i18n.changeLanguage('en'))
  expect(
    screen.getByRole('region', { name: 'Top up with a redemption code' })
  ).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Buy redemption codes' })
  ).toHaveAttribute('href', storeUrl)
})

it.each([
  { condition: 'missing store URL', topupLink: undefined, disabled: false },
  {
    condition: 'unsafe store URL',
    topupLink: 'javascript:alert(1)',
    disabled: false,
  },
  { condition: 'invalid store URL', topupLink: 'not-a-url', disabled: false },
  { condition: 'redemption is disabled', topupLink: storeUrl, disabled: true },
])('hides the purchase action when $condition', ({ topupLink, disabled }) => {
  render(
    <I18nextProvider i18n={i18n}>
      <RechargeFormCard
        {...props}
        topupLink={topupLink}
        topupInfo={{ ...topupInfo, enable_redemption: !disabled }}
      />
    </I18nextProvider>
  )
  expect(
    screen.queryByRole('link', { name: '购买卡密' })
  ).not.toBeInTheDocument()
})
