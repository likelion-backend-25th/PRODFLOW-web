export function crumbs(pathname: string): string[] {
  if (pathname === "/orders") return ["워크스페이스", "수주 및 생산기록", "수주 관리"];
  if (pathname.startsWith("/orders/schedule")) return ["워크스페이스", "수주 및 생산기록", "생산 일정 관리"];
  if (pathname.startsWith("/work-orders")) return ["워크스페이스", "수주 및 생산기록", "작업지시 관리"];
  if (pathname.startsWith("/production-plans")) return ["워크스페이스", "수주 및 생산기록", "일일 생산계획"];
  if (pathname.startsWith("/shipping")) return ["워크스페이스", "수주 및 생산기록", "배송 관리"];
  if (pathname === "/quotations/new") return ["워크스페이스", "견적 관리", "견적 작성"];
  if (pathname.startsWith("/quotations")) return ["워크스페이스", "견적 관리"];
  if (pathname === "/orders/new") return ["워크스페이스", "수주 및 생산기록", "수주 등록"];
  if (pathname.startsWith("/orders")) return ["워크스페이스", "수주 및 생산기록"];
  if (pathname === "/clients/new") return ["워크스페이스", "거래처 관리", "거래처 등록"];
  if (pathname.endsWith("/edit") && pathname.startsWith("/clients/")) return ["워크스페이스", "거래처 관리", "거래처 수정"];
  if (/^\/clients\/[^/]+$/.test(pathname)) return ["워크스페이스", "거래처 관리", "거래처 상세"];
  if (pathname.startsWith("/clients")) return ["워크스페이스", "거래처 관리"];
  if (pathname === "/products/new") return ["워크스페이스", "생산품목 관리", "생산품목 등록"];
  if (pathname.endsWith("/edit") && pathname.startsWith("/products/")) return ["워크스페이스", "생산품목 관리", "생산품목 수정"];
  if (/^\/products\/[^/]+$/.test(pathname)) return ["워크스페이스", "생산품목 관리", "생산품목 상세"];
  if (pathname.startsWith("/products")) return ["워크스페이스", "생산품목 관리"];
  if (pathname.startsWith("/lines")) return ["워크스페이스", "생산라인"];
  if (pathname.startsWith("/payments")) return ["워크스페이스", "입금 관리"];
  if (pathname.startsWith("/admin")) return ["워크스페이스", "계정 관리"];
  if (pathname.startsWith("/assistant")) return ["워크스페이스", "AI 챗봇"];
  if (pathname.startsWith("/me")) return ["워크스페이스", "내 정보"];
  if (pathname.startsWith("/calendar")) return ["워크스페이스", "대시보드", "생산 캘린더"];
  return ["워크스페이스", "대시보드"];
}
