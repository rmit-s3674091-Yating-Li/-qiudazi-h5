import { useCallback, useEffect, useState } from "react";
import { supabase } from "../repositories/supabase";
import {
  hasCurrentParticipantEligibility,
  parseParticipantEligibility,
  participantEligibilityKey,
  type ParticipantEligibilityResult,
} from "../domain/ParticipantScoringEligibilityGate";

/**
 * Read-only Match UI discovery. This hook never grants write authority.
 * The Edge validates the JWT and the point transaction independently reauthorizes.
 */
export function useParticipantScoringEligibility({
  eventId,
  matchId,
  eventVersion,
  matchVersion,
  enabled,
}: {
  eventId?: string;
  matchId?: string;
  eventVersion?: number;
  matchVersion?: number;
  enabled: boolean;
}) {
  const [authRevision, setAuthRevision] = useState(0);
  const [retryRevision, setRetryRevision] = useState(0);
  const [result, setResult] = useState<ParticipantEligibilityResult | null>(null);
  const refresh = useCallback(() => setRetryRevision((revision) => revision + 1), []);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        setAuthRevision((revision) => revision + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const validInput = Boolean(
    enabled && eventId && matchId &&
    Number.isSafeInteger(eventVersion) && (eventVersion ?? 0) > 0 &&
    Number.isSafeInteger(matchVersion) && (matchVersion ?? 0) > 0,
  );
  const key = participantEligibilityKey({
    eventId: eventId ?? "",
    matchId: matchId ?? "",
    eventVersion: eventVersion ?? 0,
    matchVersion: matchVersion ?? 0,
    authRevision,
    retryRevision,
  });

  useEffect(() => {
    if (!validInput) {
      setResult(null);
      return;
    }
    let active = true;
    setResult(null);
    void (async () => {
      if (!supabase) throw new Error("SERVICE_UNAVAILABLE");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        if (active) setResult({ key, status: "ineligible" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("participant-scoring-eligibility", {
        body: { event_id: eventId, match_id: matchId },
      });
      if (error) throw error;
      const eligible = parseParticipantEligibility(data);
      if (eligible === null) throw new Error("INVALID_ELIGIBILITY_RESPONSE");
      if (active) setResult({ key, status: eligible ? "eligible" : "ineligible" });
    })().catch(() => {
      if (active) setResult({ key, status: "unavailable" });
    });
    return () => { active = false; };
  }, [key, validInput, eventId, matchId]);

  const current = validInput && result?.key === key ? result : null;
  return {
    eligible: validInput && hasCurrentParticipantEligibility(key, result),
    checking: validInput && !current,
    unavailable: current?.status === "unavailable",
    refresh,
    authRevision,
  };
}
