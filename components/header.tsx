import React from 'react';
import Link from 'next/link';

import { clearChats } from '@/app/actions';
import { Sidebar } from '@/components/sidebar';
import { SidebarList } from '@/components/sidebar-list';
import { IconNextChat, IconSeparator } from '@/components/ui/icons';
import { SidebarFooter } from '@/components/sidebar-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { ClearHistory } from '@/components/clear-history';
import { UserMenu } from '@/components/user-menu';
import { auth } from '@/auth'

export async function Header() {
  const session = await auth();
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center justify-between border-b !bg-transparent px-4">
      <div className="flex items-center">
        {session?.user ? (
          <Sidebar>
            <React.Suspense fallback={<div className="flex-1 overflow-auto" />}>
              {/* @ts-ignore */}
              <SidebarList userId={session?.user?.id} />
            </React.Suspense>
            <SidebarFooter>
              <ThemeToggle />
              <ClearHistory clearChats={clearChats} />
            </SidebarFooter>
          </Sidebar>
          ) : (
          <Link href="/" target="_blank" rel="nofollow">
            <IconNextChat className="mr-2 size-6 dark:hidden" inverted />
            <IconNextChat className="mr-2 hidden size-6 dark:block" />
          </Link>
        )}
        <div className="flex items-center">
          <IconSeparator className="size-6 text-muted-foreground/50" />
          {session?.user ? <UserMenu user={session.user} /> : null}
        </div>
      </div>
    </header>
  )
}
