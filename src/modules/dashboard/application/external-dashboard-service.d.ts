import type {
  Actor,
  ExternalDashboardLoginResult,
  ExternalDashboardStatus,
} from '../../../types';
import type { TierCatalog } from '../../../shared/application/premium';
import type { ChatbotRepository } from '../../chatbots/infrastructure/chatbot-repository';
import type { SessionRepository } from '../../auth/infrastructure/session-repository';
import type { ExternalDashboardCredentialRepository } from '../infrastructure/external-dashboard-credential-repository';

export class ExternalDashboardService {
  constructor(args: {
    chatbotRepository: ChatbotRepository;
    credentialRepository: ExternalDashboardCredentialRepository;
    sessionRepository: SessionRepository;
    tierCatalog: TierCatalog;
  });
  getStatus(actor: Actor, chatbotId: string): Promise<ExternalDashboardStatus>;
  setCredentials(
    actor: Actor,
    chatbotId: string,
    payload?: { enabled?: boolean; username?: string; password?: string },
  ): Promise<ExternalDashboardStatus>;
  login(
    chatbotId: string,
    payload?: { username?: string; password?: string },
  ): Promise<ExternalDashboardLoginResult>;
}
