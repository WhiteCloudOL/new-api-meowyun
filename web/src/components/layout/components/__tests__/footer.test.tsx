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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { Footer } from '../footer'

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Test',
    footerHtml:
      '<b>Site footer</b><img src="x" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">unsafe</a>',
  }),
}))
vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: {} }) }))

afterEach(cleanup)

test('custom footer renders safe HTML and project attribution while removing executable content', () => {
  const { container } = render(<Footer />)
  expect(screen.getByText('Site footer').tagName).toBe('B')
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('[onerror]')).toBeNull()
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
  expect(
    container.querySelector('a[href="https://github.com/QuantumNous/new-api"]')
  ).not.toBeNull()
})
