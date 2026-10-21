import { Card, PageHeader } from "@/components/ui.tsx";

export function AssistantPage() {
  return (
    <div>
      <PageHeader title="AI 비서" />
      <Card>
        <p>백엔드 AI API가 연결되기 전에는 호출하지 않습니다.</p>
        <p className="mt-2 text-muted">납기 지연과 미입금은 대시보드의 위험 목록에서 확인할 수 있습니다.</p>
      </Card>
    </div>
  );
}
