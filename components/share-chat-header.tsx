// components/share-chat-header.tsx
'use client'

import React from 'react';
import { createShareLink } from '@/app/actions';
import { toast } from 'react-hot-toast';
import { Chat } from '@/lib/types';
import Image from 'next/image';

interface ShareChatHeaderProps {
  chatId?: string;
  chat?: Chat | null;
}

const ShareChatHeader: React.FC<ShareChatHeaderProps> = ({ chatId, chat }) => {
  const [isSharing, startSharing] = React.useTransition();

  const copyToClipboard = React.useCallback(async (text: string) => {
    let successful = false;
    try {
      if ('clipboard' in navigator && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        successful = true;
      }
    } catch (error) {
      // Handle errors silently, no need to show a toast here
    }

    if (!successful) {
      // Fallback for browsers without clipboard API support
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();

      try {
        successful = document.execCommand('copy');
      } catch (error) {
        // Handle errors silently, no need to show a toast here
      } finally {
        document.body.removeChild(textarea);
      }
    }

    if (successful) {
      toast.success('Share link copied to clipboard', { duration: 5000 }); // Adjust duration as needed
    } else {
      toast.error('Failed to copy link. Please copy and paste the link manually:\n' + text, { duration: 10000 }); // Adjust duration as needed
    }
  }, []);

  const resolveOrigin = React.useCallback(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_NEXTAUTH_URL || 'https://icm.fyi';
  }, []);

  const copySharePath = React.useCallback(
    async (sharePath: string) => {
      if (!sharePath) {
        toast.error('Share link unavailable.');
        return;
      }
      const origin = resolveOrigin();
      const normalized = sharePath.startsWith('http')
        ? sharePath
        : `${origin}${sharePath.startsWith('/') ? '' : '/'}${sharePath}`;
      await copyToClipboard(normalized);
    },
    [copyToClipboard, resolveOrigin]
  );

  const handleShareClick = React.useCallback(() => {
    const targetId = chat?.id ?? chatId;
    if (!targetId) {
      toast.error('Chat not found');
      return;
    }

    if (chat?.sharePath) {
      void copySharePath(chat.sharePath);
      return;
    }

    startSharing(async () => {
      try {
        const result = await createShareLink(targetId);
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        await copySharePath(result.sharePath);
      } catch (error) {
        console.error('share-chat-header: share action failed', error);
        toast.error('Error sharing chat.');
      }
    });
  }, [chat?.id, chat?.sharePath, chatId, copySharePath]);

  return (
    <header className="pointer-events-auto fixed right-6 top-6 z-50">
      <button
        type="button"
        onClick={handleShareClick}
        disabled={isSharing}
        className="group inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-white transition-all duration-200 hover:bg-white/10 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Share chat"
      >
        <Image
          src="/ui_icons/share_chat_2.svg"
          alt="Share"
          width={20}
          height={20}
          className="transition-transform duration-200 group-hover:scale-110"
          priority
        />
      </button>
    </header>
  );
};

export default ShareChatHeader;
