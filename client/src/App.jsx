import { Routes, Route } from 'react-router-dom';
import LandingPage from './views/LandingPage.jsx';
import HostScreen from './views/HostScreen.jsx';
import SettingsPage from './views/SettingsPage.jsx';
import PlayerView from './views/PlayerView.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/host" element={<HostScreen />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/join/:roomCode" element={<PlayerView />} />
    </Routes>
  );
}
