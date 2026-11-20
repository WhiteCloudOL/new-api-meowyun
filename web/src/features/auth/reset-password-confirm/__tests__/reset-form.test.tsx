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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'

import { ResetPasswordConfirm } from '../index'

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: 'Test', logo: '/logo.png' }),
}))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))

beforeEach(() => {
  window.history.replaceState(
    {},
    '',
    '/user/reset#email=person%40example.test&token=test-only-reset-token'
  )
})
afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

async function renderReset() {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/user/reset',
    component: ResetPasswordConfirm,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/user/reset'] }),
  })
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  await screen.findByLabelText('New password')
}

test('fragment reset credentials leave the address bar and password confirmation blocks mismatches', async () => {
  const post = vi.spyOn(api, 'post')
  await renderReset()
  expect(window.location.hash).toBe('')
  expect(window.location.search).toBe('')
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), 'test-password-long')
  await user.type(
    screen.getByLabelText('Confirm password'),
    'different-password'
  )
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findByText('Passwords do not match')
  expect(post).not.toHaveBeenCalled()
})

test('submits a chosen password and clears it after success without displaying server secrets', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: 'must-not-display-server-secret' },
  })
  const notification = vi.spyOn(toast, 'success')
  await renderReset()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), 'chosen-test-password')
  await user.type(
    screen.getByLabelText('Confirm password'),
    'chosen-test-password'
  )
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await screen.findByText('Password changed successfully')
  expect(post).toHaveBeenCalledWith('/api/user/reset', {
    email: 'person@example.test',
    token: 'test-only-reset-token',
    password: 'chosen-test-password',
  })
  expect(screen.queryByLabelText('New password')).toBeNull()
  expect(document.body.textContent).not.toContain('chosen-test-password')
  expect(document.body.textContent).not.toContain(
    'must-not-display-server-secret'
  )
  expect(notification).toHaveBeenCalledWith('Password changed successfully')
})

test('expired reset authorization leaves the form available and reports the failure', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'Expired authorization' },
  })
  await renderReset()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), 'chosen-test-password')
  await user.type(
    screen.getByLabelText('Confirm password'),
    'chosen-test-password'
  )
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  await waitFor(() => expect(handleServerError).toHaveBeenCalled())
  expect(screen.queryByText('Password changed successfully')).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Reset password' })
  ).not.toBeDisabled()
})

test('missing reset authorization disables submission', async () => {
  window.history.replaceState({}, '', '/user/reset')
  await renderReset()
  expect(screen.getByRole('button', { name: 'Reset password' })).toBeDisabled()
})
