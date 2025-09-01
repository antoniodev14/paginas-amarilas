import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

type Sess = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

export function useAuthRole() {
  const [session, setSession] = useState<Sess>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  // 1) Obtener sesión inicial y suscribirse a cambios
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);

      if (session?.user) {
        const uid = session.user.id;
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
        setFullName(p?.full_name ?? null);

        const { data: bm } = await supabase.from('business_members').select('role').eq('user_id', uid).limit(1);
        setIsOwner((bm ?? []).some((r:any) => r.role === 'owner'));
      }
    })();

    const sub = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);              // <-- actualiza sesión
    });

    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return { session, fullName, isOwner, signOut };
  // 2) Recalcular perfil y isOwner siempre que cambie el usuario logueado
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        if (!session?.user) {
          setFullName(null);
          setIsOwner(false);
          return;
        }
        const uid = session.user.id;

        // Perfil
        const { data: prof, error: ep } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', uid)
          .maybeSingle();
        if (ep) throw ep;
        if (!cancelled) setFullName(prof?.full_name ?? null);

        // ¿Es OWNER de algún negocio? (mira business_members -> role='owner')
        const { data: bm, error: ebm } = await supabase
          .from('business_members')
          .select('business_id')
          .eq('user_id', uid)
          .eq('role', 'owner')
          .limit(1);
        if (ebm) throw ebm;
        if (!cancelled) setIsOwner((bm?.length ?? 0) > 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id]);   // <-- clave: recalcula cuando inicia/cierra sesión

  return useMemo(() => ({
    loading, session, fullName, isOwner,
    signOut: () => supabase.auth.signOut(),
  }), [loading, session, fullName, isOwner]);
}
