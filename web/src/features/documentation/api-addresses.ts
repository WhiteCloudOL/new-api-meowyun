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
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'

export function useDocumentationApiAddresses() {
  const { items, loading } = useApiInfo()
  const origin = window.location.origin
  const addresses = items.length > 0 ? items : [{ url: origin, route: '' }]
  let baseUrl = origin

  try {
    const first = new URL(addresses[0].url)
    if (first.protocol === 'https:' || first.protocol === 'http:') {
      // The Markdown templates append the protocol paths themselves.
      const prefix = first.pathname
        .replace(/\/+$/, '')
        .replace(/\/v1(?:beta)?$/, '')
      // Keep the base URL literal inside both shell quote styles.
      baseUrl =
        first.origin +
        prefix
          .replaceAll("'", '%27')
          .replaceAll('!', '%21')
          .replaceAll(/[$`]/g, encodeURIComponent)
    }
  } catch {
    // Use the current origin if a legacy address is invalid.
  }

  return { addresses, baseUrl, loading }
}
