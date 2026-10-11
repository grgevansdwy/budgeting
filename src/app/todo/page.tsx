import type { Metadata } from "next";
import { TodoList } from "@/components/todo/TodoList";

export const metadata: Metadata = {
  title: "To-do · Budget",
};

export default function TodoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-zinc-900">Money to collect</h1>
      <p className="mt-1 mb-4 text-sm text-zinc-600">
        One line per share someone owes you. Remove a line once you have asked
        for the money.
      </p>
      <TodoList />
    </main>
  );
}
