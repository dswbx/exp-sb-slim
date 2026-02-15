import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

interface Todo {
  id: string;
  title: string;
  is_complete: boolean;
  is_private: boolean;
  user_id: string | null;
}

export default function TodoList({ user }: { user: User | null }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");

  async function fetchTodos() {
    const { data } = await supabase
      .from("todos")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTodos(data);
  }

  useEffect(() => {
    fetchTodos();
  }, [user]);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await supabase.from("todos").insert({ title: title.trim(), user_id: user!.id });
    setTitle("");
    fetchTodos();
  }

  async function toggleComplete(todo: Todo) {
    await supabase.from("todos").update({ is_complete: !todo.is_complete }).eq("id", todo.id);
    fetchTodos();
  }

  async function togglePrivate(todo: Todo) {
    await supabase.from("todos").update({ is_private: !todo.is_private }).eq("id", todo.id);
    fetchTodos();
  }

  async function deleteTodo(id: string) {
    await supabase.from("todos").delete().eq("id", id);
    fetchTodos();
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {user && (
        <form onSubmit={addTodo} className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New todo..."
            className="flex-1 rounded border px-3 py-2"
          />
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Add
          </button>
        </form>
      )}

      {todos.length === 0 && (
        <p className="text-center text-gray-500">No todos yet.</p>
      )}

      <ul className="space-y-2">
        {todos.map((todo) => {
          const isOwner = user && todo.user_id === user.id;
          return (
            <li
              key={todo.id}
              className="flex items-center gap-3 rounded border px-3 py-2"
            >
              {isOwner && (
                <button
                  onClick={() => toggleComplete(todo)}
                  className={`h-5 w-5 flex-shrink-0 rounded border ${
                    todo.is_complete ? "bg-green-500 border-green-500" : "border-gray-400"
                  }`}
                  title={todo.is_complete ? "Mark incomplete" : "Mark complete"}
                />
              )}
              <span
                className={`flex-1 ${todo.is_complete ? "line-through text-gray-400" : ""}`}
              >
                {todo.title}
              </span>
              {todo.is_private && (
                <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                  private
                </span>
              )}
              {isOwner && (
                <>
                  <button
                    onClick={() => togglePrivate(todo)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                    title={todo.is_private ? "Make public" : "Make private"}
                  >
                    {todo.is_private ? "📢" : "🔒"}
                  </button>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                    title="Delete"
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
