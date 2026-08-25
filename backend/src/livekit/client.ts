import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../env.js';

const httpUrl = env.LIVEKIT_URL.replace(/^ws/, 'http');

export const roomService = new RoomServiceClient(httpUrl, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

export const webhookReceiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

interface IssueTokenParams {
  roomName: string;
  identity: string;
  displayName: string;
  canPublish?: boolean;
}

export async function issueParticipantToken({
  roomName,
  identity,
  displayName,
  canPublish = true,
}: IssueTokenParams): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity,
    name: displayName,
    ttl: '12h',
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  });
  // toJwt() é assíncrono no server-sdk v2 (diferente do v1) — não esquecer o await.
  return at.toJwt();
}
