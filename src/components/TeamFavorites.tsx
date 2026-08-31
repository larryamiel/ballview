/** Team picker for the favorited team. Feature 2. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../lib/api';
import { errorMessage } from '../lib/api';

interface Props {
  favoriteTeamId: number | null;
}

export function TeamFavorites({ favoriteTeamId }: Props) {
  const queryClient = useQueryClient();

  const { data: teams, isPending, error } = useQuery({
    queryKey: ['teams'],
    queryFn: api.getTeams,
    // The team list changes at most once a season.
    staleTime: 24 * 60 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (teamId: number | null) => api.setFavoriteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      // A new favorite means a different history log, and a backfill worth running.
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  if (isPending) return <p className="muted small">Loading teams…</p>;
  if (error) return <p className="error-inline small">{errorMessage(error)}</p>;

  return (
    <div className="favorites">
      <label htmlFor="favorite-team" className="muted small">
        Favorite team
      </label>
      <select
        id="favorite-team"
        value={favoriteTeamId ?? ''}
        onChange={(e) => mutation.mutate(e.target.value ? Number(e.target.value) : null)}
        disabled={mutation.isPending}
      >
        <option value="">None</option>
        {teams?.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name ?? team.teamName ?? `Team ${team.id}`}
          </option>
        ))}
      </select>
      {mutation.error && (
        <p className="error-inline small">{errorMessage(mutation.error)}</p>
      )}
    </div>
  );
}
