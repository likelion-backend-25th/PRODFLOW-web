import { useSyncExternalStore } from "react";
import { sampleAddresses } from "@/lib/addresses.ts";
import { addDays, todayISO } from "@/lib/dates.ts";
import { integrityIssues } from "@/lib/integrity.ts";
import { depositTarget, orderQuantity, orderTotal, paymentStatusOf } from "@/lib/money.ts";
import { isWorkingDay, splitQuantityByLines } from "@/lib/schedule.ts";
import type {
  Client,
  Database,
  Holiday,
  NotificationLog,
  Order,
  OrderLine,
  OrderStatus,
  Product,
  StatusHistory,
  User,
  WorkOrder,
  WorkOrderStatus,
} from "@/types/domain.ts";

const STORAGE_KEY = "prodflow-db-v3";

function placeholderImage(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" rx="24" fill="${color}"/><text x="120" y="128" text-anchor="middle" font-size="28" fill="white" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function stamp(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

interface Actor {
  id: string;
  name: string;
}

interface OrderSpec {
  id: string;
  clientId: string;
  lines: Array<[productId: string, quantity: number, unitPrice: number]>;
  created: number;
  createdTime?: string;
  due: number;
  slots: Array<[day: number, quantity: number]>;
  status: OrderStatus;
  paid: "none" | "deposit" | "full";
  workOrder?: {
    id: string;
    assignee: Actor;
    lineId: string | null;
    status: WorkOrderStatus;
    started?: number;
    completed?: number;
  };
  produced: number;
  packed?: number;
  shipped?: { day: number; carrier: string; trackingNo: string };
  delivered?: number;
}

const HOLIDAYS: Holiday[] = [
  { id: "holiday-1", date: "2026-10-03", name: "개천절" },
  { id: "holiday-2", date: "2026-10-09", name: "한글날" },
  { id: "holiday-3", date: "2026-12-25", name: "성탄절" },
];

function seed(): Database {
  const holidays = HOLIDAYS.map((holiday) => holiday.date);
  let base = todayISO();
  while (!isWorkingDay(base, holidays)) base = addDays(base, 1);
  const day = (offset: number): string => {
    let cursor = base;
    let left = Math.abs(offset);
    while (left > 0) {
      cursor = addDays(cursor, offset < 0 ? -1 : 1);
      if (isWorkingDay(cursor, holidays)) left -= 1;
    }
    return cursor;
  };
  const year = base.slice(0, 4);

  const office: Actor = { id: "user-order", name: "수주관리자" };
  const floor1: Actor = { id: "user-floor-1", name: "현장관리자 1" };
  const floor2: Actor = { id: "user-floor-2", name: "현장관리자 2" };

  const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
  const account = (no: number, loginId: string, department: string) => ({
    accountNo: `AC-${String(no).padStart(4, "0")}`,
    loginId,
    email: `${loginId}@prodflow.example`,
    department,
    createdAt: stamp(day(-40 + no), "09:00"),
  });
  const users: User[] = [
    { id: "user-admin", ...account(1, "admin", "경영지원팀"), password: "admin1234", name: "최고관리자", role: "SUPER_ADMIN", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(5) },
    { id: office.id, ...account(2, "order", "영업관리팀"), password: "order1234", name: office.name, role: "ORDER_MANAGER", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(40) },
    { id: floor1.id, ...account(3, "floor1", "생산팀"), password: "floor1234", name: floor1.name, role: "PRODUCTION_MANAGER", status: "ACTIVE", clockedIn: true, lastLoginAt: ago(95) },
    { id: floor2.id, ...account(4, "floor2", "생산팀"), password: "floor1234", name: floor2.name, role: "PRODUCTION_MANAGER", status: "ACTIVE", clockedIn: true, lastLoginAt: ago(110) },
    { id: "user-viewer", ...account(5, "viewer", "경영지원팀"), password: "viewer1234", name: "조회담당", role: "VIEWER", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(60 * 26) },
    { id: "user-floor-3", ...account(6, "floor3", "생산팀"), password: "floor1234", name: "현장관리자 3", role: "PRODUCTION_MANAGER", status: "INACTIVE", clockedIn: false, lastLoginAt: null },
  ];

  const clients: Client[] = [
    {
      id: "client-1",
      businessNumber: "1234567890",
      companyName: "케이스온",
      representative: "케이스온 대표",
      address: "서울특별시 금천구 가산디지털1로 168",
      postalCode: "08507",
      addressDetail: "",
      phone: "02-1234-1000",
      contactName: "케이스온 담당",
      contactMobile: "010-1111-1000",
      taxEmail: "tax@caseon.example",
      createdAt: stamp(day(-120), "09:00"),
    },
    {
      id: "client-2",
      businessNumber: "2203344556",
      companyName: "모빌쉘",
      representative: "모빌쉘 대표",
      address: "경기도 화성시 동탄기흥로 560",
      postalCode: "18478",
      addressDetail: "",
      phone: "031-222-2000",
      contactName: "모빌쉘 담당",
      contactMobile: "010-2222-2000",
      taxEmail: "tax@mobileshell.example",
      createdAt: stamp(day(-60), "09:00"),
    },
    {
      id: "client-3",
      businessNumber: "3056677889",
      companyName: "한빛모바일",
      representative: "한빛모바일 대표",
      address: "인천광역시 서구 북항로 32",
      postalCode: "22853",
      addressDetail: "",
      phone: "032-333-3000",
      contactName: "한빛모바일 담당",
      contactMobile: "010-3333-3000",
      taxEmail: "tax@hanbit.example",
      createdAt: stamp(day(-45), "09:00"),
    },
  ];

  const catalogDay = stamp(day(-15), "09:00");
  const products: Product[] = [
    {
      id: "product-1",
      productName: "클리어 케이스",
      modelName: "iPhone 16",
      description: "투명 하드 케이스",
      unitPrice: 4500,
      designImageUrl: placeholderImage("CLEAR", "#12786f"),
      createdAt: catalogDay,
      updatedAt: stamp(day(-7), "11:00"),
      createdByName: office.name,
    },
    {
      id: "product-2",
      productName: "맥세이프 케이스",
      modelName: "iPhone 16 Pro",
      description: "자석 링 케이스",
      unitPrice: 8900,
      designImageUrl: placeholderImage("MAG", "#0f5f59"),
      createdAt: catalogDay,
      updatedAt: catalogDay,
      createdByName: office.name,
    },
    {
      id: "product-3",
      productName: "카드 케이스",
      modelName: "Galaxy S25",
      description: "카드 수납 케이스",
      unitPrice: 7200,
      designImageUrl: placeholderImage("CARD", "#1c1f23"),
      createdAt: catalogDay,
      updatedAt: catalogDay,
      createdByName: office.name,
    },
    {
      id: "product-4",
      productName: "젤리 케이스",
      modelName: "Galaxy S24",
      description: "말랑한 젤리 케이스",
      unitPrice: 3200,
      designImageUrl: placeholderImage("JELLY", "#667085"),
      createdAt: catalogDay,
      updatedAt: catalogDay,
      createdByName: office.name,
    },
  ];

  // 오래된 수주부터 번호를 붙인다. product-1은 첫 수주 뒤에 4,200원에서 4,500원으로 올랐다.
  const specs: OrderSpec[] = [
    {
      id: "order-done",
      clientId: "client-1",
      lines: [["product-1", 700, 4200]],
      created: -8,
      due: -4,
      slots: [[-6, 700]],
      status: "COMPLETED",
      paid: "full",
      workOrder: { id: "wo-done", assignee: floor1, lineId: "line-1", status: "COMPLETED", started: -6, completed: -6 },
      produced: 700,
      packed: -6,
      shipped: { day: -5, carrier: "한진택배", trackingNo: "430098765432" },
      delivered: -4,
    },
    {
      id: "order-shipping",
      clientId: "client-3",
      lines: [["product-4", 300, 3200]],
      created: -7,
      due: 0,
      slots: [[-5, 300]],
      status: "SHIPPING",
      paid: "deposit",
      workOrder: { id: "wo-shipping", assignee: floor2, lineId: "line-2", status: "COMPLETED", started: -5, completed: -5 },
      produced: 300,
      packed: -5,
      shipped: { day: -1, carrier: "CJ대한통운", trackingNo: "560012345678" },
    },
    {
      id: "order-packed",
      clientId: "client-2",
      lines: [["product-2", 600, 8900]],
      created: -5,
      due: 1,
      slots: [[-3, 600]],
      status: "PACKED",
      paid: "deposit",
      workOrder: { id: "wo-packed", assignee: floor1, lineId: "line-1", status: "COMPLETED", started: -3, completed: -3 },
      produced: 600,
      packed: -2,
    },
    {
      id: "order-packing",
      clientId: "client-1",
      lines: [["product-1", 400, 4500]],
      created: -4,
      due: 2,
      slots: [[-1, 400]],
      status: "PACKING",
      paid: "deposit",
      workOrder: { id: "wo-packing", assignee: floor1, lineId: "line-2", status: "COMPLETED", started: -1, completed: -1 },
      produced: 400,
    },
    {
      id: "order-running",
      clientId: "client-3",
      lines: [["product-3", 1000, 7200]],
      created: -3,
      due: 3,
      slots: [[-1, 500], [0, 500]],
      status: "IN_PRODUCTION",
      paid: "deposit",
      workOrder: { id: "wo-running", assignee: floor2, lineId: "line-1", status: "IN_PRODUCTION", started: -1 },
      produced: 0,
    },
    {
      id: "order-ready",
      clientId: "client-2",
      lines: [["product-2", 500, 8900]],
      created: -1,
      due: 2,
      slots: [[0, 500]],
      status: "CONFIRMED",
      paid: "deposit",
      workOrder: { id: "wo-ready", assignee: floor1, lineId: null, status: "READY" },
      produced: 0,
    },
    {
      id: "order-waiting",
      clientId: "client-1",
      lines: [["product-1", 500, 4500], ["product-4", 300, 3200]],
      created: -1,
      createdTime: "16:30",
      due: 4,
      slots: [[1, 800]],
      status: "WAITING",
      paid: "none",
      produced: 0,
    },
  ];

  const orders: Order[] = [];
  const workOrders: WorkOrder[] = [];
  const histories: StatusHistory[] = [];
  const notifications: NotificationLog[] = [];

  specs.forEach((spec, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    const lines: OrderLine[] = spec.lines.map(([productId, quantity, unitPrice], lineIndex) => ({
      id: `${spec.id}-line-${lineIndex + 1}`,
      productId,
      quantity,
      unitPrice,
      vatIncluded: true,
    }));
    const total = orderTotal(lines);
    const quantity = orderQuantity(lines);
    const paidAmount = spec.paid === "none" ? 0 : spec.paid === "full" ? total : depositTarget(total);
    const client = clients.find((item) => item.id === spec.clientId) as Client;
    const allocations = spec.slots.map(([offset, amount]) => ({ date: day(offset), quantity: amount }));
    const dueDate = day(spec.due);
    const createdAt = stamp(day(spec.created), spec.createdTime ?? "10:00");
    const confirmedAt = stamp(day(spec.created), "15:00");
    let previous = "NONE";
    const move = (entity: StatusHistory["entity"], entityId: string, to: string, at: string, actor: Actor, from?: string) => {
      histories.push({
        id: `hist-${histories.length + 1}`,
        entity,
        entityId,
        fromStatus: from ?? previous,
        toStatus: to,
        at,
        actorId: actor.id,
        actorName: actor.name,
      });
      if (entity === "ORDER") previous = to;
    };

    move("ORDER", spec.id, "WAITING", createdAt, office);
    if (spec.paid !== "none") move("ORDER", spec.id, "CONFIRMED", confirmedAt, office);

    const plan = spec.workOrder;
    if (plan) {
      const startedAt = plan.started === undefined ? null : stamp(day(plan.started), "09:00");
      const completedAt = plan.completed === undefined ? null : stamp(day(plan.completed), "17:00");
      workOrders.push({
        id: plan.id,
        orderId: spec.id,
        status: plan.status,
        assigneeId: plan.assignee.id,
        lineId: plan.lineId,
        quantity,
        allocations: allocations.map((slot) => ({ ...slot })),
        issuedAt: confirmedAt,
        plannedStartDate: allocations[0].date,
        plannedEndDate: allocations[allocations.length - 1].date,
        startedAt,
        completedAt,
      });
      if (startedAt) {
        move("ORDER", spec.id, "IN_PRODUCTION", startedAt, plan.assignee);
        move("WORK_ORDER", plan.id, "IN_PRODUCTION", startedAt, plan.assignee, "READY");
      }
      if (completedAt) {
        move("ORDER", spec.id, "PACKING", completedAt, plan.assignee);
        move("WORK_ORDER", plan.id, "COMPLETED", completedAt, plan.assignee, "IN_PRODUCTION");
      }
      if (spec.packed !== undefined) move("ORDER", spec.id, "PACKED", stamp(day(spec.packed), "18:00"), plan.assignee);
    }
    if (spec.shipped) {
      const shippedAt = stamp(day(spec.shipped.day), "10:00");
      move("ORDER", spec.id, "SHIPPING", shippedAt, office);
      notifications.push({
        id: `notice-${notifications.length + 1}`,
        orderId: spec.id,
        success: true,
        message: "출고 안내 SMS를 예시로 발송 성공 처리했습니다.",
        at: shippedAt,
      });
    }
    const completedAt = spec.delivered === undefined ? null : stamp(day(spec.delivered), "16:00");
    if (completedAt) move("ORDER", spec.id, "COMPLETED", completedAt, office);

    orders.push({
      id: spec.id,
      orderNo: `PF-${year}-${sequence}`,
      clientId: spec.clientId,
      lines,
      requestedDueDate: dueDate,
      dueDate,
      plannedStartDate: allocations[0].date,
      plannedEndDate: allocations[allocations.length - 1].date,
      allocations,
      shippingAddress: client.address,
      receiverPhone: client.contactMobile,
      notifyChannel: "SMS",
      memo: "",
      status: spec.status,
      paymentStatus: paymentStatusOf(paidAmount, total),
      paidAmount,
      virtualAccount: `국민 ${year}-0${sequence}-${sequence}`,
      coveredQuantity: spec.paid === "none" ? 0 : quantity,
      producedQuantity: spec.produced,
      carrier: spec.shipped?.carrier ?? "",
      trackingNo: spec.shipped?.trackingNo ?? "",
      createdAt,
      completedAt,
    });
  });

  const db: Database = {
    users,
    clients,
    products,
    orders: orders.reverse(),
    workOrders: workOrders.reverse(),
    lines: [
      { id: "line-1", name: "1라인", dailyCapacity: 500, status: "RUNNING" },
      { id: "line-2", name: "2라인", dailyCapacity: 500, status: "AVAILABLE" },
      { id: "line-3", name: "3라인", dailyCapacity: 300, status: "MAINTENANCE" },
    ],
    lineCapacityLogs: [
      {
        id: "line-log-1",
        lineId: "line-1",
        beforeCapacity: 400,
        afterCapacity: 500,
        reason: "금형 교체 후 하루 생산량을 올렸습니다.",
        userId: "user-admin",
        changedAt: stamp(day(-12), "14:00"),
      },
    ],
    holidays: HOLIDAYS,
    histories: histories.sort((left, right) => right.at.localeCompare(left.at)),
    notifications: notifications.reverse(),
    attendance: users.filter((user) => user.clockedIn).map((user) => ({
      id: `attendance-${user.id}`,
      userId: user.id,
      clockInAt: user.lastLoginAt ?? new Date().toISOString(),
      clockOutAt: null,
    })),
  };
  if (import.meta.env.DEV) {
    const issues = integrityIssues(db);
    if (issues.length > 0) console.warn("예시 데이터 정합성 오류", issues);
  }
  return db;
}

let memory: Database | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const departmentOf: Record<User["role"], string> = {
  SUPER_ADMIN: "경영지원팀",
  ORDER_MANAGER: "영업관리팀",
  PRODUCTION_MANAGER: "생산팀",
  VIEWER: "경영지원팀",
};

function repair(db: Database): boolean {
  let changed = false;
  if (!Array.isArray(db.lineCapacityLogs)) {
    db.lineCapacityLogs = [];
    changed = true;
  }
  if (!Array.isArray(db.attendance)) {
    db.attendance = db.users.filter((user) => user.clockedIn).map((user) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      clockInAt: user.lastLoginAt ?? new Date().toISOString(),
      clockOutAt: null,
    }));
    changed = true;
  }
  db.orders.forEach((order) => {
    const legacy = order as Partial<Order> & Order;
    if (legacy.receiverPhone !== undefined && legacy.notifyChannel && legacy.memo !== undefined) return;
    const client = db.clients.find((item) => item.id === order.clientId);
    legacy.receiverPhone ??= client?.contactMobile || client?.phone || "";
    legacy.notifyChannel ??= "SMS";
    legacy.memo ??= "";
    changed = true;
  });
  db.orders.forEach((order) => {
    if (!["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD"].includes(order.status) || order.producedQuantity === 0) return;
    order.producedQuantity = 0;
    changed = true;
  });
  db.clients.forEach((client) => {
    if (client.id) return;
    client.id = crypto.randomUUID();
    changed = true;
  });
  db.clients.forEach((client) => {
    if (client.addressDetail !== undefined) return;
    client.addressDetail = "";
    changed = true;
  });
  db.clients.forEach((client) => {
    if (client.postalCode !== undefined) return;
    client.postalCode = sampleAddresses.find((item) => item.road === client.address)?.zonecode ?? "";
    changed = true;
  });
  db.clients.forEach((client) => {
    if (client.createdAt) return;
    const firstOrder = db.orders.filter((order) => order.clientId === client.id).map((order) => order.createdAt).sort()[0];
    client.createdAt = firstOrder ?? new Date().toISOString();
    changed = true;
  });
  db.workOrders.forEach((workOrder) => {
    if (Array.isArray(workOrder.allocations)) return;
    workOrder.allocations = [];
    changed = true;
  });
  const holidays = db.holidays.map((holiday) => holiday.date);
  [...db.orders]
    .sort((left, right) => left.plannedStartDate.localeCompare(right.plannedStartDate) || left.createdAt.localeCompare(right.createdAt))
    .forEach((order) => {
      const wos = db.workOrders.filter((item) => item.orderId === order.id && item.status !== "CANCELLED");
      if (wos.length === 0 || wos.every((item) => item.allocations.length > 0)) return;
      if (wos.length === 1) {
        wos[0].allocations = order.allocations.map((slot) => ({ ...slot }));
        changed = true;
        return;
      }
      try {
        const occupying = db.workOrders.filter(
          (item) => item.status !== "CANCELLED" && item.lineId && item.orderId !== order.id,
        );
        const chunks = splitQuantityByLines(
          order.allocations,
          wos.reduce((sum, item) => sum + item.quantity, 0),
          db.lines,
          holidays,
          occupying,
        );
        const used = new Set<string>();
        wos.forEach((workOrder) => {
          const chunk =
            chunks.find((item) => item.lineId === workOrder.lineId && !used.has(item.lineId)) ??
            chunks.find((item) => !used.has(item.lineId));
          if (!chunk) return;
          used.add(chunk.lineId);
          workOrder.allocations = chunk.allocations.map((slot) => ({ ...slot }));
          workOrder.plannedStartDate = chunk.plannedStartDate;
          workOrder.plannedEndDate = chunk.plannedEndDate;
          if (workOrder.status === "READY") workOrder.quantity = chunk.quantity;
          changed = true;
        });
      } catch {
        return;
      }
    });
  const firstEvent = [...db.histories.map((item) => item.at), ...db.orders.map((order) => order.createdAt)].sort()[0] ?? new Date().toISOString();
  let lastNo = Math.max(0, ...db.users.map((user) => Number(user.accountNo?.slice(3)) || 0));
  db.users.forEach((user) => {
    const legacy = user as Partial<User> & User;
    if (legacy.accountNo && legacy.email && legacy.department && legacy.createdAt && legacy.lastLoginAt !== undefined) return;
    if (!legacy.accountNo) {
      lastNo += 1;
      legacy.accountNo = `AC-${String(lastNo).padStart(4, "0")}`;
    }
    legacy.email ??= `${user.loginId}@prodflow.example`;
    legacy.department ??= departmentOf[user.role];
    legacy.createdAt ??= firstEvent;
    legacy.lastLoginAt ??= null;
    changed = true;
  });
  return changed;
}

export function readDb(): Database {
  if (memory) return memory;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    memory = JSON.parse(raw) as Database;
    if (repair(memory)) localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    return memory;
  }
  memory = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  return memory;
}

export function writeDb(next: Database): void {
  memory = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emit();
}

export function updateDb(mutator: (db: Database) => void): Database {
  const next = structuredClone(readDb());
  mutator(next);
  writeDb(next);
  return next;
}

export function resetDb(): void {
  writeDb(seed());
}

export function useDb(): Database {
  return useSyncExternalStore(subscribe, readDb, readDb);
}
