'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

import { Button } from '@/components/ui/button'

type SeedAction = (path?: string) => Promise<{ error?: string; ok?: boolean; seeded?: number }>

interface SampleConversationsButtonProps {
  action: SeedAction
  path?: string
}

export function SampleConversationsButton({
  action,
  path = '/'
}: SampleConversationsButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await action(path)
          if (result && 'error' in result) {
            toast.error(result.error ?? 'Unable to seed sample chats.')
            return
          }
          toast.success('Sample conversations added to your workspace.')
          router.refresh()
        })
      }
    >
      {isPending ? 'Adding…' : 'Fetch sample conversations'}
    </Button>
  )
}
