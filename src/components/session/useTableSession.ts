"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Credentials, type SessionView, getSession, joinSession, loadCreds, saveCreds, startSession, tableState,
} from "@/lib/session";

export type Stage = "loading" | "party" | "join" | "ready" | "closed";
const POLL_MS = 4000;

/** Which table session this phone is in: asks "how many?" first, lets friends join by code, keeps the shared view fresh. */
export const useTableSession = (slug: string, token: string) => {
  const [stage, setStage] = useState<Stage>("loading");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [offline, setOffline] = useState(false);
  const credsRef = useRef<Credentials | null>(null);

  const adopt = useCallback((c: Credentials | null) => {
    credsRef.current = c;
    setCreds(c);
    saveCreds(slug, token, c);
  }, [slug, token]);

  const decide = useCallback(async () => {
    try {
      const st = await tableState(slug, token);
      setStage(st?.inUse ? "join" : "party");
    } catch {
      setOffline(true);
    }
  }, [slug, token]);

  const refresh = useCallback(async () => {
    const c = credsRef.current;
    if (!c) return;
    try {
      const r = await getSession(slug, token, c);
      setOffline(false);
      if ("view" in r) { setView(r.view); setStage("ready"); return; }
      adopt(null);
      setView(null);
      if ("closed" in r) setStage("closed");
      else await decide();
    } catch {
      setOffline(true);
    }
  }, [slug, token, adopt, decide]);

  useEffect(() => {
    const c = loadCreds(slug, token);
    credsRef.current = c;
    if (c) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCreds(c);
      void (async () => {
        try {
          const r = await getSession(slug, token, c);
          if ("view" in r) { setView(r.view); setStage("ready"); return; }
          adopt(null);
          if ("closed" in r) { setStage("closed"); return; }
        } catch {
          setOffline(true);
          return;
        }
        await decide();
      })();
    } else {
      void decide();
    }
  }, [slug, token, adopt, decide]);

  useEffect(() => {
    if (stage !== "ready") return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [stage, refresh]);

  const accept = async (res: Credentials | { error: string }): Promise<string | null> => {
    if ("error" in res) {
      if (res.error === "in_use") { setStage("join"); return null; }
      if (res.error === "no_session") { setStage("party"); return null; }
      return res.error;
    }
    adopt(res);
    await refresh();
    return null;
  };

  return {
    stage, creds, view, offline, refresh,
    create: async (party: number, name: string) => accept(await startSession(slug, token, party, name)),
    join: async (code: string, name: string) => accept(await joinSession(slug, token, code, name)),
    startAgain: () => { setStage("loading"); void decide(); },
  };
};
