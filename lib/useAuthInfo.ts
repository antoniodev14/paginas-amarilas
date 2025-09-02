import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';

type SessionT = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

export function useAuthInfo() {
  const [session, setSession] = useState<SessionT>(null);

  // Cargas separadas para que el "loading" total sea robusto
  const [sessionLoading, setSessionLoading] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const [ownerBusinessIds, setOwnerBusinessIds] = useState<string[]>([]);
  const disposed = useRef(false);

  const isOwner = ownerBusinessIds.length > 0;
  const businessId = isOwner ? ownerBusinessIds[0] : null;
  const loading = sessionLoading || membershipLoading;

  async function refreshMembership(userId?: string | null) {
    // Si no hay user -> no es owner
    if (!userId) {
      if (!disposed.current) setOwnerBusinessIds([]);
      if (!disposed.current) setMembershipLoading(false);
      return;
    }

    try {
      setMembershipLoading(true);
      const { data, error } = await supabase
        .from('business_members')
        .select('business_id, role')
        .eq('user_id', userId);

      if (error) {
        console.log('[useAuthInfo] business_members error:', error);
        if (!disposed.current) setOwnerBusinessIds([]);
        return;
      }

      const ids = (data ?? [])
        .filter((r: any) => r?.role === 'owner' && r?.business_id)
        .map((r: any) => String(r.business_id));

      if (!disposed.current) {
        // normaliza y quita duplicados
        setOwnerBusinessIds(Array.from(new Set(ids)));
      }
    } catch (e) {
      console.log('[useAuthInfo] membership exception:', e);
      if (!disposed.current) setOwnerBusinessIds([]);
    } finally {
      if (!disposed.current) setMembershipLoading(false);
    }
  }

  useEffect(() => {
    disposed.current = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!disposed.current) setSession(session);
        // Arrancamos membership en paralelo al conocer el user
        await refreshMembership(session?.user?.id ?? null);
      } catch (e) {
        console.log('[useAuthInfo] getSession exception:', e);
        if (!disposed.current) {
          setSession(null);
          setOwnerBusinessIds([]);
        }
      } finally {
        if (!disposed.current) setSessionLoading(false);
      }
    })();

    // Suscripción a cambios de auth
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      try {
        if (!disposed.current) setSession(s);
        await refreshMembership(s?.user?.id ?? null);
      } catch (e) {
        console.log('[useAuthInfo] onAuthStateChange exception:', e);
      }
    });

    return () => {
      disposed.current = true;
      try {
        // defensivo: algunas plataformas no exponen subscription
        // @ts-ignore
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  return useMemo(() => ({
    session,
    loading,
    isOwner,
    businessId,        // string | null
    ownerBusinessIds,  // string[]
  }), [session, loading, isOwner, businessId, ownerBusinessIds]);
}

// Export default para compatibilidad con imports por defecto
export default useAuthInfo;
