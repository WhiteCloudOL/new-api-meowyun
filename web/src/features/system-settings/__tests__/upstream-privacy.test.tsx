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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../components/settings-page-context'
import { GlobalSettingsCard } from '../models/global-settings-card'

function PrivacySettings() {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setActions} />
      <SettingsPageProvider actionsContainer={actions}>
        <GlobalSettingsCard
          defaultValues={{
            global: {
              pass_through_request_enabled: false,
              thinking_model_blacklist: '[]',
              chat_completions_to_responses_policy: '{}',
            },
            general_setting: {
              hide_upstream_info: false,
              ping_interval_enabled: false,
              ping_interval_seconds: 60,
            },
          }}
        />
      </SettingsPageProvider>
    </>
  )
}

describe('upstream privacy setting', () => {
  it('enables hiding with the keyboard and saves the privacy option', async () => {
    const save = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <PrivacySettings />
      </QueryClientProvider>
    )
    const toggle = screen.getByRole('switch', {
      name: 'Hide upstream provider information',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    toggle.focus()
    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith('/api/option/', {
        key: 'general_setting.hide_upstream_info',
        value: true,
      })
    )
    save.mockRestore()
    client.clear()
  })
})
