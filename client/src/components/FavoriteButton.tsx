import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { useUiStore } from '../stores/uiStore';

export function FavoriteButton({
  workspaceId,
  kind,
  targetId,
}: {
  workspaceId: string;
  kind: 'project' | 'issue';
  targetId: string;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const favorites = useQuery({ queryKey: ['favorites', workspaceId], queryFn: () => api.favorites(workspaceId) });
  const saved = (favorites.data ?? []).some((item) => item.kind === kind && item.targetId === targetId);
  const toggle = useMutation({
    mutationFn: () => (saved ? api.removeFavorite(workspaceId, kind, targetId) : api.addFavorite(workspaceId, { kind, targetId })),
    onSuccess: (next) => {
      queryClient.setQueryData(['favorites', workspaceId], next);
      pushToast(saved ? 'Removed from favorites' : 'Added to favorites');
    },
    onError: (error) => pushToast(errorMessage(error)),
  });

  return (
    <button
      className={saved ? 'btn-primary' : 'btn-ghost'}
      type="button"
      aria-pressed={saved}
      disabled={!targetId || toggle.isPending}
      onClick={() => toggle.mutate()}
    >
      {saved ? 'Favorited' : 'Favorite'}
    </button>
  );
}
