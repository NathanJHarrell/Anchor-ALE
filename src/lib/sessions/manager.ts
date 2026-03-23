import type { Session } from "../types";
import {
  createSession,
  getSession,
  listSessions,
  updateSession,
  setActiveSession,
  getActiveSession as dbGetActiveSession,
  deleteSession,
} from "../database";

/** Create a new project session and switch to it. */
export async function createProject(name: string): Promise<Session> {
  const session = await createSession(name, "project");
  await setActiveSession(session.id);
  return { ...session, isActive: true };
}

/** Switch to an existing session by ID. Returns the now-active session. */
export async function switchSession(sessionId: string): Promise<Session> {
  const session = await getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  await setActiveSession(sessionId);
  return { ...session, isActive: true };
}

/** Get the currently active session (falls back to home if none active). */
export async function getActiveSession(): Promise<Session> {
  const active = await dbGetActiveSession();
  if (active) return active;
  // Fallback: activate home session
  const home = await getHomeSession();
  await setActiveSession(home.id);
  return { ...home, isActive: true };
}

/** List all project (non-home) sessions, sorted by updatedAt desc. */
export async function listProjects(): Promise<Session[]> {
  const all = await listSessions();
  return all.filter((s) => s.type !== "home");
}

/** Get the home session. */
export async function getHomeSession(): Promise<Session> {
  const all = await listSessions();
  const home = all.find((s) => s.type === "home");
  if (!home) throw new Error("Home session missing — database may be corrupt");
  return home;
}

/** Rename a session. */
export async function renameSession(sessionId: string, name: string): Promise<void> {
  await updateSession(sessionId, { name });
}

/** Delete a project session. Home session cannot be deleted. */
export async function deleteProject(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.type === "home") throw new Error("Cannot delete home session");
  // If deleting the active session, switch to home first
  if (session.isActive) {
    const home = await getHomeSession();
    await setActiveSession(home.id);
  }
  await deleteSession(sessionId);
}
