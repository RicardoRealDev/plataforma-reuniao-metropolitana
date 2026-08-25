import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@livekit/components-styles';
import './index.css';
import { Home } from './pages/Home.js';
import { SalaDeVideo } from './pages/SalaDeVideo.js';
import { MesaOperador } from './pages/MesaOperador.js';
import { Dashboard } from './pages/Dashboard.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/reuniao/:meetingId/sala" element={<SalaDeVideo />} />
        <Route path="/reuniao/:meetingId/mesa" element={<MesaOperador />} />
        <Route path="/reuniao/:meetingId/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
