import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';

const HomePage = lazy(() => import('./pages/HomePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const StandingsPage = lazy(() => import('./pages/StandingsPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="results/:season/:round" element={<ResultsPage />} />
        <Route path="standings/drivers" element={<StandingsPage kind="drivers" />} />
        <Route path="standings/constructors" element={<StandingsPage kind="constructors" />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="drivers/:season/:driverId" element={<DriverPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/:season/:teamId" element={<TeamPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
