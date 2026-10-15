import { expect, it } from 'vitest';
import { PageErrorBoundary } from '../src/components/States';

it('getDerivedStateFromError captures the error', () => {
  const error = new Error('boom');
  expect(PageErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
});
