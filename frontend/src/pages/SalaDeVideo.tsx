import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { api } from '../lib/api.js';
import type { Council, Meeting } from '../lib/types.js';
import { useAuth } from '../lib/auth.js';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL ?? 'ws://localhost:7880';

function Conferencia() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
  return (
    <>
      <GridLayout tracks={tracks} style={{ height: 'calc(100vh - 4rem)' }}>
        <ParticipantTile />
      </GridLayout>
      <RoomAudioRenderer />
      <ControlBar controls={{ microphone: true, camera: true, screenShare: false }} />
    </>
  );
}

export function SalaDeVideo() {
  const { user } = useAuth();
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<(Meeting & { council: Council }) | null>(null);
  const [memberId, setMemberId] = useState('');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    api.get<Meeting & { council: Council }>(`/meetings/${meetingId}`).then(setMeeting);
  }, [meetingId]);

  useEffect(() => {
    if (user?.accessLevel === 'PARTICIPANT' && user.memberId) setMemberId(user.memberId);
  }, [user]);

  async function entrar() {
    if (!meetingId || !memberId) return;
    const res = await api.post<{ token: string }>(`/meetings/${meetingId}/token`, { memberId });
    setToken(res.token);
  }

  if (token && meeting) {
    return (
      <LiveKitRoom
        token={token}
        serverUrl={LIVEKIT_URL}
        connect
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onDisconnected={() => {
          setToken(null);
          navigate('/');
        }}
      >
        <Conferencia />
      </LiveKitRoom>
    );
  }

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-xl font-semibold">Entrar na reunião</h1>
      {meeting && (
        <>
          <p className="mb-4 text-gray-600">{meeting.titulo}</p>
          {user?.accessLevel === 'PARTICIPANT' ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">{user.name}</p>
              <p>{user.function} · {user.institution}</p>
              <p className="mt-1 text-xs">Identidade vinculada ao token institucional.</p>
            </div>
          ) : (
            <select
              className="mb-4 w-full rounded border border-gray-300 p-2"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Selecione seu ente/representação</option>
              {meeting.council.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ente} — {m.representante}
                </option>
              ))}
            </select>
          )}
          <button className="rounded bg-slate-800 px-4 py-2 text-white" onClick={entrar} disabled={!memberId}>
            Entrar com câmera/microfone
          </button>
        </>
      )}
    </div>
  );
}
