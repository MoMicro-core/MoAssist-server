export interface SecretBoxPayload {
  encrypted: boolean;
  payload: string;
}

export class SecretBox {
  constructor(key?: string);
  key: Buffer | null;
  isConfigured(): boolean;
  encrypt(value: unknown): SecretBoxPayload;
  decrypt(box?: SecretBoxPayload | null): unknown;
}
