import { Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { GmLogin } from './pages/gm/GmLogin';
import { GmTable } from './pages/gm/GmTable';
import { GmArchives } from './pages/gm/GmArchives';
import { PlayerJoin } from './pages/player/PlayerJoin';
import { PlayerSpace } from './pages/player/PlayerSpace';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/mj" element={<GmLogin />} />
      <Route path="/mj/table" element={<GmTable />} />
      <Route path="/mj/archives" element={<GmArchives />} />
      <Route path="/jouer" element={<PlayerJoin />} />
      <Route path="/jouer/partie" element={<PlayerSpace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
