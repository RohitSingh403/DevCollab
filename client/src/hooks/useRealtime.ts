import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { useUiStore } from '../stores/uiStore';

export function useRealtime(workspaceId?: string) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const refreshWork = () => {
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['issue'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['comments'] });
      void queryClient.invalidateQueries({ queryKey: ['views'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
    };
    const onNotification = (notification: { message?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (notification.message) pushToast(notification.message);
    };

    socket.on('issue:created', refreshWork);
    socket.on('issue:updated', refreshWork);
    socket.on('issue:deleted', refreshWork);
    socket.on('comment:created', refreshWork);
    socket.on('comment:updated', refreshWork);
    socket.on('comment:deleted', refreshWork);
    socket.on('activity:created', refreshWork);
    socket.on('notification:created', onNotification);
    socket.on('view:saved', refreshWork);
    socket.on('view:deleted', refreshWork);

    if (workspaceId) socket.emit('workspace:join', workspaceId);

    return () => {
      if (workspaceId) socket.emit('workspace:leave', workspaceId);
      socket.off('issue:created', refreshWork);
      socket.off('issue:updated', refreshWork);
      socket.off('issue:deleted', refreshWork);
      socket.off('comment:created', refreshWork);
      socket.off('comment:updated', refreshWork);
      socket.off('comment:deleted', refreshWork);
      socket.off('activity:created', refreshWork);
      socket.off('notification:created', onNotification);
      socket.off('view:saved', refreshWork);
      socket.off('view:deleted', refreshWork);
    };
  }, [workspaceId, queryClient, pushToast]);
}
