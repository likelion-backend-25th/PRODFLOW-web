import { localDate, parseISO, todayISO, toISO } from "@/lib/dates.ts";
import { lineStatusLabel, lineTone, orderStatusLabel, orderStatusTone, paymentStatusLabel, paymentTone, workOrderStatusLabel } from "@/lib/labels.ts";
import { formatWon, orderQuantity, orderTotal } from "@/lib/money.ts";
import { orderItemsText } from "@/lib/orderText.ts";
export const suggestedQuestions = [
    "이번 주 납기 예정 수주 알려줘",
    "현재 진행 중인 작업지시서 보여줘",
    "작업을 시작하지 않은 작업지시서 알려줘",
    "생산라인별 작업 배정 현황 알려줘",
    "미입금 거래처 목록 보여줘",
    "이번 달 수주 현황을 요약해줘",
];
const emptyContext = { orderIds: [] };
export function answerQuestion(db, question, context) {
    const text = question.replace(/\s+/g, " ").trim();
    const today = todayISO();
    const mentioned = mentionedOrder(db, text);
    if (mentioned && /작업지시/.test(text))
        return workOrdersOf(db, [mentioned.id]);
    if (/작업지시/.test(text) && /해당|연결/.test(text)) {
        if (context.orderIds.length === 0)
            return say("먼저 수주를 조회한 뒤 연결된 작업지시를 물어봐 주세요.");
        return workOrdersOf(db, context.orderIds);
    }
    if (/그중|그 중/.test(text) && /시작하지 않|시작 전/.test(text))
        return notStartedAmong(db, context);
    if (/미입금/.test(text))
        return unpaid(db);
    if (/이번\s*주/.test(text) && /납기/.test(text))
        return dueThisWeek(db, today);
    if (/이번\s*달/.test(text) && /수주/.test(text))
        return monthSummary(db, today);
    if (/라인/.test(text))
        return lineAssignments(db);
    if (/작업지시/.test(text) && /진행|생산중/.test(text))
        return workOrdersByStatus(db, "IN_PRODUCTION", "현재 생산 중인 작업지시서");
    if (/작업지시/.test(text) && /시작하지 않|시작 전|대기|준비/.test(text))
        return workOrdersByStatus(db, "READY", "작업을 시작하지 않은 작업지시서");
    if (mentioned)
        return ordersTable(db, [mentioned], `${mentioned.orderNo} 수주입니다.`);
    return say("저장된 수주, 작업지시, 생산라인에서 아래 질문만 답할 수 있습니다. 추천 질문을 눌러 주세요.");
}
function say(text, context = emptyContext) {
    return { text, context };
}
function dueThisWeek(db, today) {
    const { start, end } = weekBounds(today);
    const orders = openOrders(db)
        .filter((order) => order.status !== "COMPLETED" && order.dueDate >= start && order.dueDate <= end)
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.orderNo.localeCompare(right.orderNo));
    const range = `${dot(start)} ~ ${dot(end)}`;
    return ordersTable(db, orders, `이번 주(${range}) 납기 예정인 수주는 총 ${orders.length}건입니다. 아래 목록을 확인해 주세요.`);
}
function notStartedAmong(db, context) {
    const orders = context.orderIds
        .map((id) => db.orders.find((order) => order.id === id))
        .filter((order) => order !== undefined)
        .filter((order) => order.status === "WAITING" || order.status === "CONFIRMED");
    if (context.orderIds.length === 0)
        return say("먼저 수주 목록을 조회한 뒤, 그 중에서 시작 전인 건을 물어봐 주세요.");
    return ordersTable(db, orders, `작업이 아직 시작되지 않은 수주는 ${orders.length}건입니다.`);
}
function unpaid(db) {
    const orders = openOrders(db)
        .filter((order) => order.paymentStatus !== "PAID")
        .sort((left, right) => left.orderNo.localeCompare(right.orderNo));
    const clients = new Set(orders.map((order) => order.clientId)).size;
    return {
        text: `입금이 끝나지 않은 수주는 ${orders.length}건이고, 거래처는 ${clients}곳입니다.`,
        context: { orderIds: orders.map((order) => order.id) },
        table: {
            columns: ["거래처명", "수주번호", "총액", "입금액", "입금상태"],
            rows: orders.map((order) => ({
                href: `/orders/${order.id}`,
                cells: [
                    { text: clientName(db, order.clientId) },
                    { text: order.orderNo },
                    { text: formatWon(orderTotal(order.lines)) },
                    { text: formatWon(order.paidAmount) },
                    { text: paymentStatusLabel[order.paymentStatus], className: paymentTone(order.paymentStatus) },
                ],
            })),
        },
    };
}
function monthSummary(db, today) {
    const month = today.slice(0, 7);
    const orders = openOrders(db).filter((order) => localDate(order.createdAt).startsWith(month));
    const groups = new Map();
    orders.forEach((order) => {
        const list = groups.get(order.status) ?? [];
        list.push(order);
        groups.set(order.status, list);
    });
    const rows = [...groups.entries()]
        .sort((left, right) => right[1].length - left[1].length)
        .map(([status, list]) => ({
        cells: [
            { text: orderStatusLabel[status], className: orderStatusTone(status) },
            { text: `${list.length}건` },
            { text: `${list.reduce((sum, order) => sum + orderQuantity(order.lines), 0).toLocaleString("ko-KR")}개` },
            { text: formatWon(list.reduce((sum, order) => sum + orderTotal(order.lines), 0)) },
        ],
    }));
    return {
        text: `${month.replace("-", "년 ")}월에 등록된 수주는 총 ${orders.length}건입니다.`,
        context: { orderIds: orders.map((order) => order.id) },
        table: rows.length > 0 ? { columns: ["진행상태", "건수", "수량", "금액"], rows } : undefined,
    };
}
function lineAssignments(db) {
    const rows = db.lines.map((line) => {
        const job = db.workOrders.find((item) => item.lineId === line.id && (item.status === "IN_PRODUCTION" || item.status === "PAUSED"));
        const order = job ? db.orders.find((item) => item.id === job.orderId) : undefined;
        return {
            href: `/lines/${line.id}`,
            cells: [
                { text: line.name },
                { text: lineStatusLabel[line.status], className: lineTone(line.status) },
                { text: `${line.dailyCapacity.toLocaleString("ko-KR")}개` },
                { text: job && order ? workOrderNo(job, order.orderNo) : "배정 없음" },
                { text: job ? personName(db, job.assigneeId) : "-" },
                { text: job ? `${job.quantity.toLocaleString("ko-KR")}개` : "-" },
            ],
        };
    });
    const running = db.lines.filter((line) => line.status === "AVAILABLE").length;
    return {
        text: `생산라인 ${db.lines.length}개 중 가동 가능한 라인은 ${running}개입니다. 생산 중이거나 일시정지인 작업만 배정으로 봅니다.`,
        context: emptyContext,
        table: { columns: ["생산라인", "상태", "하루 생산량", "작업지시", "담당자", "수량"], rows },
    };
}
function workOrdersByStatus(db, status, title) {
    const jobs = db.workOrders.filter((item) => item.status === status);
    return workOrderTable(db, jobs, `${title}는 ${jobs.length}건입니다.`);
}
function workOrdersOf(db, orderIds) {
    const orders = orderIds
        .map((id) => db.orders.find((order) => order.id === id))
        .filter((order) => order !== undefined);
    const jobs = db.workOrders.filter((item) => orderIds.includes(item.orderId) && item.status !== "CANCELLED");
    const label = orders.map((order) => order.orderNo).join(", ");
    return workOrderTable(db, jobs, `${label || "선택한 수주"}에 연결된 작업지시는 ${jobs.length}건입니다.`, orderIds);
}
function workOrderTable(db, jobs, text, orderIds) {
    const rows = jobs.map((job) => {
        const order = db.orders.find((item) => item.id === job.orderId);
        const line = db.lines.find((item) => item.id === job.lineId);
        return {
            href: `/work-orders/${job.id}`,
            cells: [
                { text: workOrderNo(job, order?.orderNo) },
                { text: order ? orderItemsText(db.products, order.lines) : "-" },
                { text: `${job.quantity.toLocaleString("ko-KR")}개` },
                { text: line?.name ?? "미배정" },
                { text: workOrderStatusLabel[job.status], className: workTone(job.status) },
                { text: order ? orderStatusLabel[order.status] : "-", className: order ? orderStatusTone(order.status) : undefined },
                { text: personName(db, job.assigneeId) },
            ],
        };
    });
    return {
        text,
        context: { orderIds: orderIds ?? [...new Set(jobs.map((job) => job.orderId))] },
        table: rows.length > 0 ? { columns: ["작업지시번호", "품목명", "작업 수량", "생산라인", "생산 단계", "작업 상태", "담당자"], rows } : undefined,
    };
}
function ordersTable(db, orders, text) {
    return {
        text,
        context: { orderIds: orders.map((order) => order.id) },
        table: orders.length > 0 ? {
            columns: ["수주번호", "거래처명", "품목명", "수량", "납기일", "진행상태"],
            rows: orders.map((order) => ({
                href: `/orders/${order.id}`,
                cells: [
                    { text: order.orderNo },
                    { text: clientName(db, order.clientId) },
                    { text: orderItemsText(db.products, order.lines) },
                    { text: orderQuantity(order.lines).toLocaleString("ko-KR") },
                    { text: dot(order.dueDate) },
                    { text: orderStatusLabel[order.status], className: orderStatusTone(order.status) },
                ],
            })),
        } : undefined,
    };
}
function openOrders(db) {
    return db.orders.filter((order) => order.status !== "CANCELLED");
}
function mentionedOrder(db, text) {
    const found = text.toUpperCase().match(/PF-\d{4}-\d+/);
    if (!found)
        return undefined;
    return db.orders.find((order) => order.orderNo === found[0]);
}
function weekBounds(today) {
    const date = parseISO(today);
    const weekday = date.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    date.setDate(date.getDate() + mondayOffset);
    const start = toISO(date);
    date.setDate(date.getDate() + 6);
    return { start, end: toISO(date) };
}
function workOrderNo(item, orderNo) {
    const issued = localDate(item.issuedAt).replaceAll("-", "");
    const tail = orderNo?.split("-").at(-1) ?? "000";
    return `WO-${issued.slice(0, 6)}-${tail}-${item.id.slice(0, 4)}`;
}
function clientName(db, clientId) {
    return db.clients.find((client) => client.id === clientId)?.companyName ?? "삭제된 거래처";
}
function personName(db, userId) {
    if (!userId)
        return "미배정";
    return db.users.find((user) => user.id === userId)?.name ?? "미배정";
}
function workTone(status) {
    if (status === "IN_PRODUCTION")
        return "bg-primary-soft text-primary";
    if (status === "PAUSED")
        return "bg-warning-soft text-warning";
    if (status === "COMPLETED")
        return "bg-emerald-50 text-emerald-700";
    if (status === "CANCELLED")
        return "bg-red-50 text-danger";
    return "bg-warning-soft text-warning";
}
function dot(iso) {
    return iso.replaceAll("-", ".");
}
