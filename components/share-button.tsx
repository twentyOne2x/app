import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { IconShare } from '@/components/ui/icons';
import { shareChat, getChat } from '@/app/actions';
import { auth } from '@/auth';
import { type Chat } from '@/lib/types';

interface ShareButtonProps {
  chatId: string;
}

const ShareButton: React.FC<ShareButtonProps> = ({ chatId }) => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    const fetchChatData = async () => {
      const session = await auth();
      const userId = session?.user?.id;
      if (userId) {
        const fetchedChat = await getChat(chatId, userId);
        if (fetchedChat) {
          setChat(fetchedChat);
        }
      }
    };

    fetchChatData();
  }, [chatId]);

  const handleShare = async () => {
    if (!chat) return;

    setIsSharing(true);

    try {
      const result = await shareChat(chat);

      if (result && 'error' in result) {
        toast.error(result.error);
        setIsSharing(false);
        return;
      }

      if (result && result.sharePath) {
        const url = new URL(window.location.href);
        url.pathname = result.sharePath;
        navigator.clipboard.writeText(url.toString());
        toast.success('Share link copied to clipboard!');
      }
    } catch (error) {
      toast.error('An error occurred while sharing.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <button onClick={handleShare} disabled={isSharing || !chat} className="your-button-class">
      <IconShare className="your-icon-class" />
      {isSharing ? 'Generating link...' : 'Share'}
    </button>
  );
};

export default ShareButton;