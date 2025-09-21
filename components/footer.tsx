import React from 'react'

import { cn } from '@/lib/utils'
import { ExternalLink } from '@/components/external-link'

export function FooterText({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'px-2 pb-2 text-center text-xs leading-normal text-muted-foreground', // Updated padding-bottom class
        className
      )}
      {...props}
    >
      Crafted by <ExternalLink href="https://twitter.com/impliedval">@impliedval</ExternalLink>, 
      championed by <ExternalLink href="https://www.twitter.com/freddmannen">@freddmannen</ExternalLink>, 
      and supported by a <ExternalLink href="https://www.flashbots.net/">Flashbots&apos;</ExternalLink> grant.
    </p>
  )
}