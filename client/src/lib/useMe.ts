import type { PublicUser } from '@f1/shared';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: PublicUser }>('/auth/me')).data.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
