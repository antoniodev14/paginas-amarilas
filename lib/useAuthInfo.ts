import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

export function useAuthInfo() {
  const [session, setSession] = useState<null | Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  async function refreshRole(userId?: string | null) {
    if (!userId) { setIsOwner(false); return; }
    const { data, error } = await supabase
      .from('business_members')
      .select('role')
      .eq('user_id', userId)
      .limit(1);
    if (error) { console.log('role error', error); setIsOwner(false); return; }
    setIsOwner((data ?? []).some((r:any) => r.role === 'owner'));
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      await refreshRole(session?.user?.id ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      setSession(s);
      await refreshRole(s?.user?.id ?? null);
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return useMemo(() => ({ session, isOwner, loading }), [session, isOwner, loading]);
}
