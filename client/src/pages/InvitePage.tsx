import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDocumentTitle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export function InvitePage() {
  const { token = '' } = useParams();
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api.previewInvite(token), enabled: Boolean(token) });
  useDocumentTitle(invite.data ? `Join ${invite.data.workspaceName}` : 'Invite');

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      pushToast(`Joined ${invite.data?.workspaceName ?? 'the workspace'}`);
      navigate(`/w/${result.workspaceId}`);
    },
  });

  const next = `/invite/${token}`;

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="panel w-full max-w-lg p-6">
        {invite.isPending ? <p>Loading invite…</p> : null}
        {invite.isError ? <p className="text-rose">{errorMessage(invite.error)}</p> : null}
        {invite.data ? (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-acid">Workspace invite</p>
            <h1 className="mt-3 font-display text-4xl font-bold">{invite.data.workspaceName}</h1>
            <p className="mt-3 text-mist-300">
              {invite.data.email} is invited as {invite.data.role}.
            </p>
            {invite.data.expired ? <p className="mt-4 text-rose">This invite has expired. Ask an admin for a new link.</p> : null}
            {invite.data.accepted ? <p className="mt-4 text-mist-300">This invite was already used.</p> : null}
            {!invite.data.expired && !invite.data.accepted ? (
              user ? (
                <button className="btn-primary mt-6" type="button" onClick={() => accept.mutate()} disabled={accept.isPending}>
                  {accept.isPending ? 'Joining…' : 'Accept invite'}
                </button>
              ) : (
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link className="btn-primary" to={`/register?email=${encodeURIComponent(invite.data.email)}&next=${encodeURIComponent(next)}`}>
                    Create account
                  </Link>
                  <Link className="btn-ghost" to={`/login?next=${encodeURIComponent(next)}`}>
                    Sign in
                  </Link>
                </div>
              )
            ) : null}
            {accept.isError ? (
              <p className="mt-4 text-sm text-rose" role="alert">
                {errorMessage(accept.error)}
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
