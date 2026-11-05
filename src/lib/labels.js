export const quotationStatusLabel = {
    SENT: "발송완료",
    APPROVED: "승인",
    REJECTED: "거절",
    CANCELLED: "취소",
    EXPIRED: "만료",
};
export function quotationStatusTone(status) {
    if (status === "SENT")
        return "bg-blue-50 text-blue-700";
    if (status === "APPROVED")
        return "bg-emerald-50 text-emerald-700";
    if (status === "REJECTED" || status === "CANCELLED")
        return "bg-red-50 text-red-700";
    return "bg-slate-100 text-slate-600";
}
export const roleLabel = {
    SUPER_ADMIN: "최고 관리자",
    ORDER_MANAGER: "수주 관리자",
    PRODUCTION_MANAGER: "생산 현장 관리자",
    VIEWER: "업무 조회 담당",
};
export const orderStatusLabel = {
    WAITING: "대기",
    CONFIRMED: "생산대기",
    IN_PRODUCTION: "생산중",
    PACKING: "포장중",
    PACKED: "포장완료",
    READY_TO_SHIP: "출고대기",
    SHIPPING: "배송중",
    COMPLETED: "완료",
    ON_HOLD: "생산보류",
    CANCELLED: "취소",
};
export const workStatusOrder = [
    "WAITING",
    "CONFIRMED",
    "IN_PRODUCTION",
    "PACKING",
    "PACKED",
    "READY_TO_SHIP",
    "SHIPPING",
    "COMPLETED",
    "ON_HOLD",
    "CANCELLED",
];
export function registrationStatus(status) {
    return status === "WAITING" || status === "CANCELLED" ? "RESERVED" : "CONFIRMED";
}
export function registrationLabel(status) {
    return registrationStatus(status) === "RESERVED" ? "예정" : "확정";
}
export function registrationTone(status) {
    return registrationStatus(status) === "RESERVED" ? "bg-orange-50 text-orange-700" : "bg-cyan-50 text-cyan-800";
}
export const workOrderStatusLabel = {
    READY: "준비",
    IN_PRODUCTION: "생산중",
    PAUSED: "일시정지",
    COMPLETED: "생산완료",
    CANCELLED: "취소",
};
export const paymentStatusLabel = {
    UNPAID: "미입금",
    PARTIAL: "부분입금",
    PAID: "입금완료",
};
export const lineStatusLabel = {
    AVAILABLE: "가동가능",
    RUNNING: "가동중",
    MAINTENANCE: "점검중",
    BROKEN: "고장",
};
export const accountStatusLabel = {
    ACTIVE: "활성",
    INACTIVE: "비활성",
    DELETED: "삭제",
};
export function orderStatusTone(status) {
    if (status === "WAITING")
        return "bg-slate-100 text-slate-600";
    if (status === "CONFIRMED")
        return "bg-blue-50 text-blue-700";
    if (status === "IN_PRODUCTION")
        return "bg-primary-soft text-primary";
    if (status === "PACKING")
        return "bg-violet-50 text-violet-700";
    if (status === "PACKED")
        return "bg-indigo-50 text-indigo-700";
    if (status === "READY_TO_SHIP")
        return "bg-teal-50 text-teal-800";
    if (status === "SHIPPING")
        return "bg-sky-50 text-sky-700";
    if (status === "COMPLETED")
        return "bg-emerald-50 text-emerald-700";
    if (status === "ON_HOLD")
        return "bg-amber-50 text-amber-800";
    return "bg-red-50 text-red-700";
}
export function paymentTone(status) {
    if (status === "PAID")
        return "bg-lime-50 text-lime-800";
    if (status === "UNPAID")
        return "bg-rose-50 text-rose-700";
    return "bg-yellow-50 text-yellow-800";
}
export function lineTone(status) {
    if (status === "AVAILABLE")
        return "bg-slate-100 text-muted";
    if (status === "MAINTENANCE")
        return "bg-warning-soft text-warning";
    if (status === "BROKEN")
        return "bg-red-50 text-danger";
    return "bg-primary-soft text-primary";
}
