import { AccessToken, WebhookReceiver } from "npm:livekit-server-sdk@2";
import { env } from "../env.ts";

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
    ttl: "12h",
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}
