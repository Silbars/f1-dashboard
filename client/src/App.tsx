import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const StandingsPage = lazy(() => import('./pages/StandingsPage'));

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="results/:season/:round" element={<ResultsPage />} />
        <Route path="standings/drivers" element={<StandingsPage kind="drivers" />} />
        <Route path="standings/constructors" element={<StandingsPage kind="constructors" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
