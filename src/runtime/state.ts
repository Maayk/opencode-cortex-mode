export class SessionStateManager {
  private static instance: SessionStateManager;
  private states = new Map<string, Record<string, any>>();

  private constructor() {}

  public static getInstance(): SessionStateManager {
    if (!SessionStateManager.instance) {
      SessionStateManager.instance = new SessionStateManager();
    }
    return SessionStateManager.instance;
  }

  public getState(sessionID: string): Record<string, any> {
    if (!sessionID) return {};
    let sessionState = this.states.get(sessionID);
    if (!sessionState) {
      sessionState = {};
      this.states.set(sessionID, sessionState);
    }
    return sessionState;
  }

  public clearState(sessionID: string): void {
    this.states.delete(sessionID);
  }

  public pruneOldSessions(maxSessions = 100): void {
    if (this.states.size > maxSessions) {
      const keys = Array.from(this.states.keys());
      const toDelete = keys.slice(0, keys.length - maxSessions);
      for (const k of toDelete) {
        this.states.delete(k);
      }
    }
  }
}
