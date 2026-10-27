import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { AccountMenu, Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';

const HomePage = lazy(() => import('./pages/HomePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const StandingsPage = lazy(() => import('./pages/StandingsPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ReplayPickerPage = lazy(() => import('./pages/ReplayPickerPage'));
const HeadToHeadPage = lazy(() => import('./pages/HeadToHeadPage'));
const ReplayPage = lazy(() => import('./pages/ReplayPage'));

export function App() {
  return (
    <Routes>
      <Route element={<Layout account={<AccountMenu />} />}>
        <Route index element={<HomePage />} />
        <Route element={<RequireAuth />}>
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="results/:season/:round" element={<ResultsPage />} />
          <Route path="standings/drivers" element={<StandingsPage kind="drivers" />} />
          <Route path="standings/constructors" element={<StandingsPage kind="constructors" />} />
          <Route path="drivers" element={<DriversPage />} />
          <Route path="drivers/:season/:driverId" element={<DriverPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="teams/:season/:teamId" element={<TeamPage />} />
          <Route path="head-to-head" element={<HeadToHeadPage />} />
          <Route path="replay" element={<ReplayPickerPage />} />
          <Route path="replay/:sessionKey" element={<ReplayPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
