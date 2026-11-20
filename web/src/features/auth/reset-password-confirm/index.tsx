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
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { PasswordInput } from '@/components/password-input'
import { PasswordStrength } from '@/components/password-strength'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { accountPasswordSchema } from '@/lib/password-policy'
import { AuthOperationError } from '@/lib/secure-verification'
import { requireServerSuccess } from '@/lib/server-error-message'

import { AuthLayout } from '../auth-layout'

export type ResetPasswordSearchParams = {
  email?: string
  token?: string
}

const resetPasswordSchema = z
  .object({
    password: accountPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function ResetPasswordConfirm(props: ResetPasswordSearchParams) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [credentials] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    return {
      email: props.email || fragment.get('email') || '',
      token: props.token || fragment.get('token') || '',
    }
  })
  const [succeeded, setSucceeded] = useState(false)
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const password = useWatch({ control: form.control, name: 'password' })
  const validLink = Boolean(credentials.email && credentials.token)

  useEffect(() => {
    // Remove both new fragment credentials and legacy query credentials
    // without remounting the page or retaining them in router history.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname
    )
  }, [])

  async function handleSubmit(values: z.infer<typeof resetPasswordSchema>) {
    if (!validLink) return
    try {
      const response = await api.post('/api/user/reset', {
        ...credentials,
        password: values.password,
      })
      requireServerSuccess(response.data)
      form.reset()
      setSucceeded(true)
      toast.success(t('Password changed successfully'))
    } catch (error) {
      handleServerError(AuthOperationError.from(error))
    }
  }

  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
          {t('Reset password')}
        </h2>
        {!validLink && (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('Invalid reset link, please request a new password reset.')}
            </AlertDescription>
          </Alert>
        )}
        {succeeded ? (
          <div className='space-y-4'>
            <Alert>
              <AlertDescription>
                {t('Password changed successfully')}
              </AlertDescription>
            </Alert>
            <Button
              className='w-full'
              onClick={() => navigate({ to: '/sign-in', replace: true })}
            >
              {t('Back to login')}
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form
              className='space-y-4'
              onSubmit={form.handleSubmit(handleSubmit)}
            >
              <div className='space-y-2'>
                <Label htmlFor='reset-email'>{t('Email')}</Label>
                <Input
                  id='reset-email'
                  type='email'
                  value={credentials.email}
                  disabled
                />
              </div>
              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('New password')}</FormLabel>
                    <FormControl describedBy='reset-password-strength'>
                      <PasswordInput
                        autoComplete='new-password'
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <PasswordStrength
                      id='reset-password-strength'
                      value={password}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='confirmPassword'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Confirm password')}</FormLabel>
                    <FormControl>
                      <PasswordInput
                        autoComplete='new-password'
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className='w-full'
                type='submit'
                disabled={!validLink || form.formState.isSubmitting}
              >
                {t('Reset password')}
              </Button>
              <Button
                className='w-full'
                type='button'
                variant='link'
                onClick={() => navigate({ to: '/sign-in', replace: true })}
              >
                {t('Back to login')}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </AuthLayout>
  )
}
