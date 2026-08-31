import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '@livekit/components-styles';
import './index.css';
import { Home } from './pages/Home.js';
import { SalaDeVideo } from './pages/SalaDeVideo.js';
import { MesaOperador } from './pages/MesaOperador.js';
import { Dashboard } from './pages/Dashboard.js';
import { Login } from './pages/Login.js';
import { AuthProvider } from './lib/auth.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { TrocarSenha } from './pages/TrocarSenha.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/trocar-senha" element={<ProtectedRoute><TrocarSenha /></ProtectedRoute>} />
          <Route path="/reuniao/:meetingId/sala" element={<ProtectedRoute><SalaDeVideo /></ProtectedRoute>} />
          <Route path="/reuniao/:meetingId/mesa" element={<ProtectedRoute><MesaOperador /></ProtectedRoute>} />
          <Route path="/reuniao/:meetingId/dashboard" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
