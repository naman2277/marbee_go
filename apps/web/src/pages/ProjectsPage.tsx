import { TaskManagerPortal } from '@/components/tasks/TaskManagerPortal';

export function ProjectsPage() {
  return (
    <div className="-m-8 h-[calc(100vh-3.5rem)] overflow-hidden">
      <TaskManagerPortal isOpen={true} isEmbedded={true} onClose={() => {}} />
    </div>
  );
}
