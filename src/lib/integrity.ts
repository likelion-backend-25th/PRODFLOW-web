import { depositTarget, orderQuantity, orderTotal, paymentStatusOf, productKey } from "@/lib/money.ts";
import { addWorkingDays, factoryCapacity, isWorkingDay, occupiesFactory } from "@/lib/schedule.ts";
import type { Database, OrderStatus, WorkOrderStatus } from "@/types/domain.ts";

const producedAll: OrderStatus[] = ["PACKING", "PACKED", "SHIPPING", "COMPLETED"];

function workOrdersMatchOrder(status: OrderStatus, active: { status: WorkOrderStatus }[]): boolean {
  const open = active.filter((item) => item.status !== "COMPLETED");
  if (status === "WAITING" || status === "CANCELLED") return active.length === 0;
  if (status === "CONFIRMED") return open.length > 0 && open.every((item) => item.status === "READY");
  if (status === "IN_PRODUCTION") return active.some((item) => item.status === "IN_PRODUCTION");
  if (status === "ON_HOLD") return active.some((item) => item.status === "PAUSED") && !active.some((item) => item.status === "IN_PRODUCTION");
  if (producedAll.includes(status)) return active.length > 0 && active.every((item) => item.status === "COMPLETED");
  return false;
}

export function integrityIssues(db: Database): string[] {
  const issues: string[] = [];
  const holidays = db.holidays.map((holiday) => holiday.date);
  const capacity = factoryCapacity(db.lines);
  const clientIds = new Set(db.clients.map((client) => client.id));
  const productIds = new Set(db.products.map((product) => product.id));
  const lineIds = new Set(db.lines.map((line) => line.id));
  const managers = new Set(db.users.filter((user) => user.role === "PRODUCTION_MANAGER").map((user) => user.id));
  const activeManagers = new Set(db.users.filter((user) => user.role === "PRODUCTION_MANAGER" && user.status === "ACTIVE").map((user) => user.id));
  const userIds = new Set(db.users.map((user) => user.id));
  const orderIds = new Set(db.orders.map((order) => order.id));

  duplicates(db.users.map((user) => user.loginId)).forEach((id) => issues.push(`아이디 중복: ${id}`));
  duplicates(db.users.map((user) => user.accountNo)).forEach((no) => issues.push(`계정번호 중복: ${no}`));
  duplicates(db.users.filter((user) => user.status !== "DELETED").map((user) => user.email)).forEach((email) => issues.push(`이메일 중복: ${email}`));
  if (!db.users.some((user) => user.role === "SUPER_ADMIN" && user.status === "ACTIVE")) issues.push("활성 최고 관리자가 없습니다.");
  db.users.forEach((user) => {
    if (user.clockedIn && (user.status !== "ACTIVE" || user.role !== "PRODUCTION_MANAGER")) issues.push(`${user.loginId}: 출근 중인데 활성 현장 관리자가 아닙니다.`);
    if (user.lastLoginAt && user.lastLoginAt < user.createdAt) issues.push(`${user.loginId}: 계정 발급 전에 로그인 기록이 있습니다.`);
    const open = db.attendance.filter((item) => item.userId === user.id && !item.clockOutAt).length;
    if (user.clockedIn ? open !== 1 : open !== 0) issues.push(`${user.loginId}: 출근 상태와 출퇴근 기록이 맞지 않습니다.`);
  });
  db.attendance.forEach((item) => {
    if (!userIds.has(item.userId)) issues.push(`출퇴근 ${item.id}: 없는 계정을 참조합니다.`);
    if (item.clockOutAt && item.clockOutAt < item.clockInAt) issues.push(`출퇴근 ${item.id}: 퇴근이 출근보다 빠릅니다.`);
  });

  duplicates(db.orders.map((order) => order.orderNo)).forEach((no) => issues.push(`수주번호 중복: ${no}`));
  duplicates(db.clients.map((client) => client.businessNumber)).forEach((no) => issues.push(`사업자등록번호 중복: ${no}`));
  duplicates(db.products.map((product) => productKey(product.productName, product.modelName))).forEach((key) => issues.push(`품목 중복: ${key}`));

  const daily = new Map<string, number>();
  for (const order of db.orders) {
    const tag = order.orderNo;
    const quantity = orderQuantity(order.lines);
    const total = orderTotal(order.lines);
    if (!clientIds.has(order.clientId)) issues.push(`${tag}: 없는 거래처를 참조합니다.`);
    order.lines.forEach((line) => {
      if (!productIds.has(line.productId)) issues.push(`${tag}: 없는 품목을 참조합니다.`);
    });
    if (order.paymentStatus !== paymentStatusOf(order.paidAmount, total)) issues.push(`${tag}: 입금 상태가 입금액과 맞지 않습니다.`);
    if (order.status !== "WAITING" && order.status !== "CANCELLED" && order.paidAmount < depositTarget(total)) issues.push(`${tag}: 선금 확인 전인데 확정 이후 상태입니다.`);
    if ((order.status === "SHIPPING" || order.status === "COMPLETED") !== Boolean(order.trackingNo)) issues.push(`${tag}: 운송장과 배송 상태가 맞지 않습니다.`);
    if ((order.status === "COMPLETED") !== Boolean(order.completedAt)) issues.push(`${tag}: 완료일과 상태가 맞지 않습니다.`);
    if (order.status === "WAITING" && order.coveredQuantity !== 0) issues.push(`${tag}: 예정 수주에 작업 수량이 잡혀 있습니다.`);
    if (order.status !== "WAITING" && order.status !== "CANCELLED" && order.coveredQuantity !== quantity) issues.push(`${tag}: 작업 수량이 수주 수량과 다릅니다.`);
    if (producedAll.includes(order.status) && order.producedQuantity !== quantity) issues.push(`${tag}: 생산 완료 이후인데 실적이 부족합니다.`);
    if (order.status === "WAITING" && order.producedQuantity !== 0) issues.push(`${tag}: 생산 전인데 실적이 있습니다.`);
    if (order.producedQuantity > quantity) issues.push(`${tag}: 실적이 수주 수량을 넘습니다.`);

    if (order.status !== "CANCELLED") {
      const allocated = order.allocations.reduce((sum, slot) => sum + slot.quantity, 0);
      if (allocated !== quantity) issues.push(`${tag}: 일정 배분 수량(${allocated})이 수주 수량(${quantity})과 다릅니다.`);
      order.allocations.forEach((slot) => {
        if (!isWorkingDay(slot.date, holidays)) issues.push(`${tag}: 휴무일 ${slot.date}에 생산이 잡혀 있습니다.`);
        if (occupiesFactory(order.status)) daily.set(slot.date, (daily.get(slot.date) ?? 0) + slot.quantity);
      });
      const dates = order.allocations.map((slot) => slot.date).sort();
      if (dates[0] !== order.plannedStartDate || dates.at(-1) !== order.plannedEndDate) issues.push(`${tag}: 생산 예정일이 일정 배분과 다릅니다.`);
      if (order.status !== "WAITING" && order.dueDate < addWorkingDays(order.plannedEndDate, 2, holidays)) {
        issues.push(`${tag}: 납기가 생산 종료 후 2영업일보다 빠릅니다.`);
      }
    }

    const active = db.workOrders.filter((item) => item.orderId === order.id && item.status !== "CANCELLED");
    if (!workOrdersMatchOrder(order.status, active)) issues.push(`${tag}: 작업지시 구성이 수주 상태와 맞지 않습니다.`);
    const workQty = active.reduce((sum, item) => sum + item.quantity, 0);
    if (order.status !== "WAITING" && order.status !== "CANCELLED" && workQty !== order.coveredQuantity) {
      issues.push(`${tag}: 작업지시 수량 합(${workQty})이 작업 수량(${order.coveredQuantity})과 다릅니다.`);
    }
    const completedQty = active.filter((item) => item.status === "COMPLETED").reduce((sum, item) => sum + item.quantity, 0);
    if (order.producedQuantity !== completedQty) issues.push(`${tag}: 실적이 완료된 작업지시 수량과 다릅니다.`);
    active.forEach((item) => {
      if (item.plannedStartDate < order.plannedStartDate || item.plannedEndDate > order.plannedEndDate) {
        issues.push(`${tag}: 작업지시 일정이 수주 예정 구간을 벗어납니다.`);
      }
    });

    const last = db.histories.filter((item) => item.entity === "ORDER" && item.entityId === order.id).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (last && last.toStatus !== order.status) issues.push(`${tag}: 마지막 상태 이력이 현재 상태와 다릅니다.`);
    if (order.paidAmount > total) issues.push(`${tag}: 입금액이 수주 금액을 넘습니다.`);
  }
  daily.forEach((sum, date) => {
    if (sum > capacity) issues.push(`${date}: 하루 생산량 ${capacity}개를 넘는 ${sum}개가 잡혀 있습니다.`);
  });

  const holders = new Map<string, number>();
  const runners = new Map<string, number>();
  for (const workOrder of db.workOrders) {
    const tag = `작업지시 ${workOrder.id}`;
    if (!orderIds.has(workOrder.orderId)) issues.push(`${tag}: 없는 수주를 참조합니다.`);
    if (workOrder.assigneeId && !managers.has(workOrder.assigneeId)) issues.push(`${tag}: 현장 관리자가 아닌 담당자입니다.`);
    const open = workOrder.status === "READY" || workOrder.status === "IN_PRODUCTION" || workOrder.status === "PAUSED";
    if (open && workOrder.assigneeId && !activeManagers.has(workOrder.assigneeId)) issues.push(`${tag}: 진행 중인 작업의 담당자 계정이 활성 상태가 아닙니다.`);
    if (workOrder.lineId && !lineIds.has(workOrder.lineId)) issues.push(`${tag}: 없는 라인을 참조합니다.`);
    const allocated = (workOrder.allocations ?? []).reduce((sum, slot) => sum + slot.quantity, 0);
    if (workOrder.status !== "CANCELLED" && allocated !== workOrder.quantity) {
      issues.push(`${tag}: 일자별 수량 합(${allocated})이 지시 수량(${workOrder.quantity})과 다릅니다.`);
    }
    const dates = (workOrder.allocations ?? []).map((slot) => slot.date).sort();
    if (dates.length > 0 && (dates[0] !== workOrder.plannedStartDate || dates.at(-1) !== workOrder.plannedEndDate)) {
      issues.push(`${tag}: 작업지시 예정일이 일자별 수량과 다릅니다.`);
    }
    if (workOrder.status === "READY" && workOrder.startedAt) issues.push(`${tag}: 시작 전인데 시작 시각이 있습니다.`);
    if (workOrder.status !== "READY" && workOrder.status !== "CANCELLED" && (!workOrder.lineId || !workOrder.startedAt)) issues.push(`${tag}: 생산 라인이나 시작 시각이 없습니다.`);
    if ((workOrder.status === "COMPLETED") !== Boolean(workOrder.completedAt)) issues.push(`${tag}: 완료 시각과 상태가 맞지 않습니다.`);
    if ((workOrder.status === "IN_PRODUCTION" || workOrder.status === "PAUSED") && workOrder.lineId) holders.set(workOrder.lineId, (holders.get(workOrder.lineId) ?? 0) + 1);
    if (workOrder.status === "IN_PRODUCTION" && workOrder.assigneeId) runners.set(workOrder.assigneeId, (runners.get(workOrder.assigneeId) ?? 0) + 1);
  }
  for (const line of db.lines) {
    const held = holders.get(line.id) ?? 0;
    if (held > 1) issues.push(`${line.name}: 작업 ${held}건이 동시에 점유합니다.`);
    if ((line.status === "RUNNING") !== (held > 0)) issues.push(`${line.name}: 라인 상태와 점유 작업이 맞지 않습니다.`);
  }
  runners.forEach((count, userId) => {
    if (count > 1) issues.push(`${userId}: 한 담당자가 생산중 작업 ${count}건을 맡고 있습니다.`);
  });

  const now = new Date().toISOString();
  for (const history of db.histories) {
    if (history.at > now) issues.push(`이력 ${history.id}: 아직 오지 않은 시각(${history.at})에 기록되어 있습니다.`);
    const known = history.entity === "ORDER" ? orderIds.has(history.entityId) : db.workOrders.some((item) => item.id === history.entityId);
    if (!known) issues.push(`이력 ${history.id}: 없는 대상을 참조합니다.`);
    if (!userIds.has(history.actorId)) issues.push(`이력 ${history.id}: 없는 계정이 처리한 기록입니다.`);
  }
  for (const notice of db.notifications) {
    if (!orderIds.has(notice.orderId)) issues.push(`알림 ${notice.id}: 없는 수주를 참조합니다.`);
  }
  return issues;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  });
  return [...repeated];
}
