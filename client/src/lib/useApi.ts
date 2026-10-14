import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const useApi = <T>(path: string) => useQuery({ queryKey: [path], queryFn: () => api.get<T>(path) });
