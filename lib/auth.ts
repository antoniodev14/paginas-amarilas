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
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    })();

    const sub = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);              // <-- actualiza sesión
    });

    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

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
