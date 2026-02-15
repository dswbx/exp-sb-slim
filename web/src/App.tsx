import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import Auth from "./components/Auth";
import TodoList from "./components/TodoList";
import type { User } from "@supabase/supabase-js";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mx-auto mb-8 flex max-w-lg items-center justify-between">
        <h1 className="text-2xl font-bold">Todos</h1>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">{user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded border px-3 py-1 hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <span className="text-sm text-gray-500">Not signed in</span>
        )}
      </header>

      {!user && (
        <div className="mb-8">
          <Auth />
        </div>
      )}

      <TodoList user={user} />
    </div>
  );
}
