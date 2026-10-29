import { useSyncExternalStore } from "react";
import { sampleAddresses } from "@/lib/addresses.ts";
import { addDays, todayISO } from "@/lib/dates.ts";
import { integrityIssues } from "@/lib/integrity.ts";
import { depositTarget, nextModelCode, orderQuantity, orderTotal, paymentStatusOf } from "@/lib/money.ts";
import { allocateProductItems, divideAllocationsByProduct, isWorkingDay, splitQuantityByLines } from "@/lib/schedule.ts";
import type {
  Client,
  Database,
  Holiday,
  NotificationLog,
  Order,
  OrderLine,
  OrderStatus,
  Product,
  Quotation,
  StatusHistory,
  User,
  WorkOrder,
  WorkOrderStatus,
} from "@/types/domain.ts";

const STORAGE_KEY = "prodflow-db-v5";

function client(id: string, companyName: string, representative: string, phone: string, taxEmail: string, roadAddress: string): Client {
  return {
    id,
    companyName,
    representative,
    zipcode: sampleAddresses.find((item) => item.road === roadAddress)?.zonecode ?? "",
    roadAddress,
    detailAddress: "",
    phone,
    contactName: representative,
    contactMobile: phone,
    taxEmail,
    createdAt: stamp("2026-01-01", "09:00"),
  };
}

function product(
  id: string,
  productName: string,
  modelName: string,
  description: string,
  unitPrice: number,
  label: string,
  color: string,
  at: string,
  createdByName: string,
): Product {
  return {
    id,
    modelCode: "",
    productName,
    modelName,
    description,
    unitPrice,
    designImageUrl: placeholderImage(label, color),
    createdAt: at,
    updatedAt: at,
    createdByName,
  };
}

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
  memo?: string;
}

const HOLIDAYS: Holiday[] = [
  { id: "holiday-1", date: "2026-01-01", name: "신정" },
  { id: "holiday-2", date: "2026-02-16", name: "설날 연휴" },
  { id: "holiday-3", date: "2026-02-17", name: "설날" },
  { id: "holiday-4", date: "2026-02-18", name: "설날 연휴" },
  { id: "holiday-5", date: "2026-03-01", name: "삼일절" },
  { id: "holiday-6", date: "2026-05-05", name: "어린이날" },
  { id: "holiday-7", date: "2026-05-24", name: "부처님오신날" },
  { id: "holiday-8", date: "2026-06-06", name: "현충일" },
  { id: "holiday-9", date: "2026-08-15", name: "광복절" },
  { id: "holiday-10", date: "2026-09-24", name: "추석 연휴" },
  { id: "holiday-11", date: "2026-09-25", name: "추석" },
  { id: "holiday-12", date: "2026-10-03", name: "개천절" },
  { id: "holiday-13", date: "2026-10-09", name: "한글날" },
  { id: "holiday-14", date: "2026-12-25", name: "성탄절" },
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

  const office: Actor = { id: "user-order", name: "정수아" };
  const floor1: Actor = { id: "user-floor-1", name: "박준혁" };
  const floor2: Actor = { id: "user-floor-2", name: "최민서" };
  const floor4: Actor = { id: "user-floor-4", name: "윤지호" };

  const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
  const account = (no: number, loginId: string, department: string) => ({
    accountNo: `AC-${String(no).padStart(4, "0")}`,
    loginId,
    email: `${loginId}@prodflow.example`,
    department,
    createdAt: stamp(day(-40 + no), "09:00"),
  });
  const users: User[] = [
    { id: "user-admin", ...account(1, "admin", "경영지원팀"), password: "admin1234", name: "김하늘", role: "SUPER_ADMIN", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(5) },
    { id: office.id, ...account(2, "order", "영업팀"), password: "order1234", name: office.name, role: "ORDER_MANAGER", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(40) },
    { id: floor1.id, ...account(3, "floor1", "생산팀"), password: "floor1234", name: floor1.name, role: "PRODUCTION_MANAGER", status: "ACTIVE", clockedIn: true, lastLoginAt: ago(95) },
    { id: floor2.id, ...account(4, "floor2", "생산팀"), password: "floor1234", name: floor2.name, role: "PRODUCTION_MANAGER", status: "ACTIVE", clockedIn: true, lastLoginAt: ago(110) },
    { id: "user-viewer", ...account(5, "viewer", "경영지원팀"), password: "viewer1234", name: "한예린", role: "VIEWER", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(60 * 26) },
    { id: "user-floor-3", ...account(6, "floor3", "생산팀"), password: "floor1234", name: "오세훈", role: "PRODUCTION_MANAGER", status: "INACTIVE", clockedIn: false, lastLoginAt: null },
    { id: "user-order-2", ...account(7, "order2", "영업팀"), password: "order1234", name: "이서준", role: "ORDER_MANAGER", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(180) },
    { id: floor4.id, ...account(8, "floor4", "생산팀"), password: "floor1234", name: floor4.name, role: "PRODUCTION_MANAGER", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(60 * 8) },
    { id: "user-viewer-2", ...account(9, "viewer2", "경영지원팀"), password: "viewer1234", name: "배수빈", role: "VIEWER", status: "ACTIVE", clockedIn: false, lastLoginAt: ago(60 * 50) },
    { id: "user-order-3", ...account(10, "order3", "영업팀"), password: "order1234", name: "김태리", role: "ORDER_MANAGER", status: "INACTIVE", clockedIn: false, lastLoginAt: null },
  ];

  const clients: Client[] = [
    client("client-1", "케이스온", "김도윤", "02-1234-1000", "buyer@caseon.example", "서울특별시 금천구 가산디지털1로 168"),
    client("client-2", "모빌쉘", "박서연", "031-222-2000", "order@mobileshell.example", "경기도 화성시 동탄기흥로 560"),
    client("client-3", "한빛모바일", "이준호", "032-333-3000", "sales@hanbitmobile.example", "인천광역시 서구 북항로 32"),
    client("client-4", "폰가드", "정유진", "051-444-4000", "cs@phoneguard.example", "부산광역시 강서구 녹산산단382로 14"),
    client("client-5", "커버마켓", "장민재", "053-555-5000", "hello@covermarket.example", "대구광역시 달서구 성서공단로11길 22"),
    client("client-6", "쉘팩토리", "송하은", "02-666-6000", "sales@shellfactory.example", "서울특별시 영등포구 양평로 22"),
    client("client-7", "넥스트커버", "한지민", "031-777-7000", "order@nextcover.example", "경기도 성남시 분당구 판교로 242"),
    client("client-8", "스마트가드", "오민석", "042-888-8000", "hello@smartguard.example", "대전광역시 유성구 테크노중앙로 55"),
    client("client-9", "라인업케이스", "서하늘", "062-999-9000", "cs@lineupcase.example", "광주광역시 북구 첨단과기로 333"),
    client("client-10", "데일리쉘", "배준영", "044-101-1000", "buyer@dailyshell.example", "세종특별자치시 한누리대로 2130"),
    client("client-11", "프로텍트랩", "노수아", "052-202-2000", "order@protectlab.example", "울산광역시 남구 테크노산업로 55"),
    client("client-12", "케이스랩", "문지호", "063-303-3000", "sales@caselab.example", "전북특별자치도 전주시 덕진구 기린대로 1055"),
  ];

  const catalogDay = stamp(day(-15), "09:00");
  const products: Product[] = [
    {
      id: "product-1",
      modelCode: "PM-0001",
      productName: "클리어 케이스",
      modelName: "iPhone 16",
      description: "투명 PC 1.0mm, 무인쇄",
      unitPrice: 4500,
      designImageUrl: placeholderImage("CLEAR", "#12786f"),
      createdAt: catalogDay,
      updatedAt: stamp(day(-7), "11:00"),
      createdByName: office.name,
    },
    {
      id: "product-2",
      modelCode: "PM-0002",
      productName: "맥세이프 케이스",
      modelName: "iPhone 16 Pro",
      description: "자석 링 내장, 무선충전 가능",
      unitPrice: 8900,
      designImageUrl: placeholderImage("MAG", "#0f5f59"),
      createdAt: catalogDay,
      updatedAt: catalogDay,
      createdByName: office.name,
    },
    {
      id: "product-3",
      modelCode: "PM-0003",
      productName: "카드 케이스",
      modelName: "Galaxy S25",
      description: "카드 2장 수납, TPU 범퍼",
      unitPrice: 7200,
      designImageUrl: placeholderImage("CARD", "#1c1f23"),
      createdAt: catalogDay,
      updatedAt: catalogDay,
      createdByName: office.name,
    },
    {
      id: "product-4",
      modelCode: "PM-0004",
      productName: "젤리 케이스",
      modelName: "Galaxy S24",
      description: "TPU 0.8mm, 무광",
      unitPrice: 3200,
      designImageUrl: placeholderImage("JELLY", "#667085"),
      createdAt: catalogDay,
      updatedAt: catalogDay,
      createdByName: office.name,
    },
    product("product-5", "실리콘 케이스", "iPhone 16", "액상 실리콘, 단추 커버", 5900, "SOFT", "#5b6b7a", catalogDay, office.name),
    product("product-6", "맥세이프 케이스", "iPhone 16 Pro Max", "자석 링, 카메라 가드", 9800, "MAX", "#0b3d3a", catalogDay, office.name),
    product("product-7", "클리어 케이스", "Galaxy S25", "투명 PC, 카메라 링", 4500, "S25", "#12786f", catalogDay, office.name),
    product("product-8", "범퍼 케이스", "Galaxy S25", "사각 범퍼, 충격 흡수", 6400, "BUMP", "#3d4a3e", catalogDay, office.name),
    product("product-9", "카드 케이스", "iPhone 16", "카드 1장 수납, 자석 클로저", 6900, "CARD16", "#243044", catalogDay, office.name),
    product("product-10", "젤리 케이스", "iPhone 16", "TPU 0.8mm, 투명", 3200, "J16", "#7a6a58", catalogDay, office.name),
    product("product-11", "실리콘 케이스", "Galaxy S25", "액상 실리콘, 카메라 가드", 5900, "S25S", "#4d5d6a", catalogDay, office.name),
    product("product-12", "범퍼 케이스", "iPhone 16 Pro", "사각 범퍼, 맥세이프 호환", 6800, "B16", "#2f3d34", catalogDay, office.name),
  ];

  // 오래된 수주부터 번호를 붙인다. product-1은 첫 수주 뒤에 4,200원에서 4,500원으로 올랐다.
  const specs: OrderSpec[] = [
    {
      id: "order-old-1",
      clientId: "client-6",
      lines: [["product-5", 350, 5900]],
      created: -24,
      due: -20,
      slots: [[-22, 350]],
      status: "COMPLETED",
      paid: "full",
      workOrder: { id: "wo-old-1", assignee: floor4, lineId: "line-1", status: "COMPLETED", started: -22, completed: -22 },
      produced: 350,
      packed: -21,
      shipped: { day: -20, carrier: "롯데택배", trackingNo: "310011122233" },
      delivered: -20,
      memo: "실리콘 단추 커버. 납품 완료.",
    },
    {
      id: "order-old-2",
      clientId: "client-7",
      lines: [["product-7", 480, 4500]],
      created: -23,
      due: -19,
      slots: [[-21, 480]],
      status: "COMPLETED",
      paid: "full",
      workOrder: { id: "wo-old-2", assignee: floor1, lineId: "line-2", status: "COMPLETED", started: -21, completed: -21 },
      produced: 480,
      packed: -20,
      shipped: { day: -19, carrier: "한진택배", trackingNo: "430011100221" },
      delivered: -19,
      memo: "갤럭시 투명 케이스. 카메라 링 포함.",
    },
    {
      id: "order-old-3",
      clientId: "client-8",
      lines: [["product-8", 250, 6400]],
      created: -22,
      due: -18,
      slots: [[-20, 250]],
      status: "COMPLETED",
      paid: "full",
      workOrder: { id: "wo-old-3", assignee: floor2, lineId: "line-1", status: "COMPLETED", started: -20, completed: -20 },
      produced: 250,
      packed: -19,
      shipped: { day: -18, carrier: "CJ대한통운", trackingNo: "560044455566" },
      delivered: -18,
      memo: "범퍼 사각 모서리. 잔금 포함 완납.",
    },
    {
      id: "order-old-4",
      clientId: "client-9",
      lines: [["product-6", 180, 9800]],
      created: -21,
      due: -17,
      slots: [[-19, 180]],
      status: "COMPLETED",
      paid: "deposit",
      workOrder: { id: "wo-old-4", assignee: floor4, lineId: "line-2", status: "COMPLETED", started: -19, completed: -19 },
      produced: 180,
      packed: -18,
      shipped: { day: -17, carrier: "로젠택배", trackingNo: "880077766655" },
      delivered: -17,
      memo: "프로 맥스 맥세이프. 잔금은 계산서 발행 후.",
    },
    {
      id: "order-old-5",
      clientId: "client-10",
      lines: [["product-5", 200, 5900], ["product-9", 200, 6900]],
      created: -18,
      due: -14,
      slots: [[-16, 400]],
      status: "COMPLETED",
      paid: "full",
      workOrder: { id: "wo-old-5", assignee: floor1, lineId: "line-1", status: "COMPLETED", started: -16, completed: -16 },
      produced: 400,
      packed: -15,
      shipped: { day: -14, carrier: "한진택배", trackingNo: "430022233344" },
      delivered: -14,
      memo: "실리콘과 카드 케이스 합포장.",
    },
    {
      id: "order-cancelled",
      clientId: "client-4",
      lines: [["product-10", 120, 3200]],
      created: -10,
      due: -6,
      slots: [[-8, 120]],
      status: "CANCELLED",
      paid: "none",
      produced: 0,
      memo: "거래처 사양 변경으로 수주 취소. 계약금 없음.",
    },
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
      memo: "투명 PC, 로고 인쇄 없음. 납품 완료.",
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
      memo: "무광 젤리. 잔금은 배송 완료 후.",
    },
    {
      id: "order-packed",
      clientId: "client-2",
      lines: [["product-2", 600, 8900]],
      created: -5,
      due: 1,
      slots: [[-3, 600]],
      status: "READY_TO_SHIP",
      paid: "deposit",
      workOrder: { id: "wo-packed", assignee: floor1, lineId: "line-1", status: "COMPLETED", started: -3, completed: -3 },
      produced: 600,
      packed: -2,
      memo: "맥세이프 링 위치 샘플 확인 완료.",
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
      memo: "투명 케이스. 포장 후 출고 대기.",
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
      memo: "카드 수납 2장 사양. 1라인 생산 중.",
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
      memo: "계약금 확인. 라인 배정 전.",
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
      memo: "계약금 입금 전. 투명 케이스와 젤리 케이스 합배송.",
    },
    {
      id: "order-waiting-2",
      clientId: "client-11",
      lines: [["product-10", 200, 3200]],
      created: -1,
      createdTime: "09:10",
      due: 5,
      slots: [[1, 200]],
      status: "WAITING",
      paid: "none",
      produced: 0,
      memo: "아이폰 젤리. 계약금 확인 전.",
    },
    {
      id: "order-confirmed-2",
      clientId: "client-12",
      lines: [["product-11", 600, 5900]],
      created: -1,
      createdTime: "09:20",
      due: 5,
      slots: [[2, 600]],
      status: "CONFIRMED",
      paid: "deposit",
      workOrder: { id: "wo-confirmed-2", assignee: floor4, lineId: null, status: "READY" },
      produced: 0,
      memo: "갤럭시 실리콘. 라인 배정 전.",
    },
    {
      id: "order-waiting-3",
      clientId: "client-6",
      lines: [["product-12", 700, 6800]],
      created: -1,
      createdTime: "09:40",
      due: 6,
      slots: [[3, 700]],
      status: "WAITING",
      paid: "none",
      produced: 0,
      memo: "프로 범퍼. 색상 확정 후 계약금 예정.",
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
    }));
    const total = orderTotal(lines, false);
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
      const pieces = divideAllocationsByProduct(allocations, lines.map((line) => ({ productId: line.productId, quantity: line.quantity })));
      pieces.forEach((piece, pieceIndex) => {
        const id = pieceIndex === 0 ? plan.id : `${plan.id}-${pieceIndex + 1}`;
        workOrders.push({
          id,
          orderId: spec.id,
          status: plan.status,
          assigneeId: plan.assignee.id,
          lineId: plan.lineId,
          quantity: piece.quantity,
          items: [{ productId: piece.productId, quantity: piece.quantity }],
          allocations: piece.allocations,
          issuedAt: confirmedAt,
          plannedStartDate: piece.allocations[0]?.date ?? allocations[0].date,
          plannedEndDate: piece.allocations.at(-1)?.date ?? allocations[allocations.length - 1].date,
          startedAt,
          completedAt,
        });
        if (startedAt) {
          if (pieceIndex === 0) move("ORDER", spec.id, "IN_PRODUCTION", startedAt, plan.assignee);
          move("WORK_ORDER", id, "IN_PRODUCTION", startedAt, plan.assignee, "READY");
        }
        if (completedAt) {
          if (pieceIndex === 0) move("ORDER", spec.id, "PACKING", completedAt, plan.assignee);
          move("WORK_ORDER", id, "COMPLETED", completedAt, plan.assignee, "IN_PRODUCTION");
        }
      });
      if (spec.packed !== undefined && !spec.shipped) move("ORDER", spec.id, "READY_TO_SHIP", stamp(day(spec.packed), "18:00"), plan.assignee);
    }
    if (spec.shipped) {
      const shippedAt = stamp(day(spec.shipped.day), "10:00");
      move("ORDER", spec.id, "READY_TO_SHIP", stamp(day(spec.shipped.day), "09:00"), office);
      move("ORDER", spec.id, "SHIPPING", shippedAt, office);
      notifications.push({
        id: `notice-${notifications.length + 1}`,
        orderId: spec.id,
        success: true,
        message: `${spec.lines.map(([productId]) => products.find((item) => item.id === productId)?.productName ?? "케이스").join(", ")} 출고 안내를 문자로 보냈습니다.`,
        at: shippedAt,
      });
    }
    const completedAt = spec.delivered === undefined ? null : stamp(day(spec.delivered), "16:00");
    if (completedAt) move("ORDER", spec.id, "COMPLETED", completedAt, office);
    if (spec.status === "CANCELLED") move("ORDER", spec.id, "CANCELLED", stamp(day(spec.created), "17:00"), office);

    orders.push({
      id: spec.id,
      orderNo: `PF-${year}-${sequence}`,
      clientId: spec.clientId,
      lines,
      requestedDueDate: dueDate,
      dueDate,
      plannedStartDate: allocations[0].date,
      plannedEndDate: allocations[allocations.length - 1].date,
      depositDueDate: allocations[0].date,
      allocations,
      shippingAddress: client.roadAddress,
      receiverPhone: client.contactMobile,
      notifyChannel: "SMS",
      memo: spec.memo ?? "",
      status: spec.status,
      confirmationStatus: spec.status === "CANCELLED" ? "CANCELLED" : spec.status === "WAITING" ? "PENDING" : "CONFIRMED",
      vatIncluded: false,
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
    quotations: quotationsFor(orders, office, day),
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
    notifications: [
      ...notifications.reverse(),
      { id: "notice-deposit-1", orderId: "order-ready", success: true, message: "모빌쉘 맥세이프 케이스 계약금 입금 확인 문자를 보냈습니다.", at: stamp(day(-1), "15:10") },
      { id: "notice-deposit-2", orderId: "order-confirmed-2", success: true, message: "케이스랩 실리콘 케이스 계약금 입금 확인 문자를 보냈습니다.", at: stamp(day(-1), "15:20") },
      { id: "notice-balance", orderId: "order-old-4", success: true, message: "라인업케이스 잔금 계산서 안내 메일을 보냈습니다.", at: stamp(day(-16), "11:00") },
      { id: "notice-fail", orderId: "order-shipping", success: false, message: "한빛모바일 잔금 안내 문자 발송에 실패했습니다. 번호를 확인해 주세요.", at: stamp(day(-1), "09:40") },
      { id: "notice-pack", orderId: "order-packed", success: true, message: "모빌쉘 맥세이프 케이스 포장 완료 안내를 보냈습니다.", at: stamp(day(-2), "18:10") },
    ],
    attendance: [
      ...[-5, -4, -3, -2].flatMap((offset) => [
        { id: `attendance-floor1-${offset}`, userId: floor1.id, clockInAt: stamp(day(offset), "08:30"), clockOutAt: stamp(day(offset), "18:00") },
        { id: `attendance-floor2-${offset}`, userId: floor2.id, clockInAt: stamp(day(offset), "08:40"), clockOutAt: stamp(day(offset), "18:10") },
      ]),
      ...users.filter((user) => user.clockedIn).map((user) => ({
        id: `attendance-${user.id}`,
        userId: user.id,
        clockInAt: user.lastLoginAt ?? new Date().toISOString(),
        clockOutAt: null,
      })),
    ],
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

function quoteLine(id: string, productId: string, quantity: number, unitPrice: number): OrderLine {
  return { id, productId, quantity, unitPrice };
}

function quotationsFor(orders: Order[], author: Actor, day: (offset: number) => string): Quotation[] {
  const year = day(0).slice(0, 4);
  const linked = [...orders]
    .sort((left, right) => left.orderNo.localeCompare(right.orderNo))
    .map((order) => {
      const id = `quote-for-${order.id}`;
      order.quotationId = id;
      const quotation: Quotation = {
        id,
        quotationNo: "",
        clientId: order.clientId,
        userId: author.id,
        lines: order.lines.map((line) => quoteLine(`${id}-${line.productId}`, line.productId, line.quantity, line.unitPrice)),
        requestedDueDate: order.requestedDueDate,
        estimatedDueDate: order.dueDate,
        validUntil: order.dueDate,
        status: "APPROVED",
        vatIncluded: order.vatIncluded,
        plannedStartDate: order.plannedStartDate,
        plannedEndDate: order.plannedEndDate,
        createdAt: order.createdAt,
        updatedAt: order.createdAt,
      };
      return quotation;
    });

  const sentAt = stamp(day(-2), "10:00");
  const revisedAt = stamp(day(-1), "11:00");
  const extras: Quotation[] = [
    {
      id: "quote-sent",
      quotationNo: "",
      clientId: "client-4",
      userId: author.id,
      lines: [quoteLine("quote-sent-line", "product-5", 800, 5900)],
      requestedDueDate: day(7),
      estimatedDueDate: day(7),
      validUntil: day(12),
      status: "SENT",
      vatIncluded: false,
      plannedStartDate: day(4),
      plannedEndDate: day(5),
      createdAt: sentAt,
      updatedAt: revisedAt,
    },
    {
      id: "quote-open",
      quotationNo: "",
      clientId: "client-5",
      userId: author.id,
      lines: [quoteLine("quote-open-line", "product-6", 200, 9800)],
      requestedDueDate: day(8),
      estimatedDueDate: day(8),
      validUntil: day(14),
      status: "APPROVED",
      vatIncluded: false,
      plannedStartDate: day(5),
      plannedEndDate: day(6),
      createdAt: stamp(day(-4), "11:00"),
      updatedAt: stamp(day(-1), "15:00"),
    },
    {
      id: "quote-rejected",
      quotationNo: "",
      clientId: "client-1",
      userId: author.id,
      lines: [quoteLine("quote-rejected-line", "product-8", 300, 6400)],
      requestedDueDate: day(6),
      estimatedDueDate: day(6),
      validUntil: day(10),
      status: "REJECTED",
      vatIncluded: false,
      plannedStartDate: day(3),
      plannedEndDate: day(4),
      createdAt: stamp(day(-6), "10:00"),
      updatedAt: stamp(day(-5), "16:00"),
    },
    {
      id: "quote-cancelled",
      quotationNo: "",
      clientId: "client-2",
      userId: author.id,
      lines: [quoteLine("quote-cancelled-line", "product-7", 400, 4500)],
      requestedDueDate: day(9),
      estimatedDueDate: day(9),
      validUntil: day(11),
      status: "CANCELLED",
      vatIncluded: false,
      plannedStartDate: day(6),
      plannedEndDate: day(7),
      createdAt: stamp(day(-3), "09:30"),
      updatedAt: stamp(day(-2), "17:00"),
    },
    {
      id: "quote-expired",
      quotationNo: "",
      clientId: "client-3",
      userId: author.id,
      lines: [quoteLine("quote-expired-line", "product-4", 200, 3200)],
      requestedDueDate: day(3),
      estimatedDueDate: day(3),
      validUntil: day(-1),
      status: "EXPIRED",
      vatIncluded: false,
      plannedStartDate: day(1),
      plannedEndDate: day(1),
      createdAt: stamp(day(-12), "10:00"),
      updatedAt: stamp(day(-1), "00:10"),
    },
    {
      id: "quote-sent-2",
      quotationNo: "",
      clientId: "client-6",
      userId: author.id,
      lines: [quoteLine("quote-sent-2-line", "product-9", 500, 6900)],
      requestedDueDate: day(9),
      estimatedDueDate: day(9),
      validUntil: day(14),
      status: "SENT",
      vatIncluded: false,
      plannedStartDate: day(6),
      plannedEndDate: day(7),
      createdAt: stamp(day(-1), "14:00"),
      updatedAt: stamp(day(-1), "14:00"),
    },
    {
      id: "quote-sent-3",
      quotationNo: "",
      clientId: "client-8",
      userId: author.id,
      lines: [quoteLine("quote-sent-3-line", "product-11", 350, 5900)],
      requestedDueDate: day(10),
      estimatedDueDate: day(10),
      validUntil: day(15),
      status: "SENT",
      vatIncluded: false,
      plannedStartDate: day(7),
      plannedEndDate: day(8),
      createdAt: stamp(day(-2), "15:00"),
      updatedAt: stamp(day(-2), "15:00"),
    },
    {
      id: "quote-open-2",
      quotationNo: "",
      clientId: "client-7",
      userId: author.id,
      lines: [quoteLine("quote-open-2-line", "product-12", 250, 6800)],
      requestedDueDate: day(11),
      estimatedDueDate: day(11),
      validUntil: day(16),
      status: "APPROVED",
      vatIncluded: false,
      plannedStartDate: day(8),
      plannedEndDate: day(9),
      createdAt: stamp(day(-5), "10:30"),
      updatedAt: stamp(day(-2), "11:00"),
    },
    {
      id: "quote-open-3",
      quotationNo: "",
      clientId: "client-10",
      userId: author.id,
      lines: [quoteLine("quote-open-3-a", "product-1", 300, 4500), quoteLine("quote-open-3-b", "product-10", 200, 3200)],
      requestedDueDate: day(12),
      estimatedDueDate: day(12),
      validUntil: day(16),
      status: "APPROVED",
      vatIncluded: false,
      plannedStartDate: day(9),
      plannedEndDate: day(10),
      createdAt: stamp(day(-6), "13:00"),
      updatedAt: stamp(day(-3), "16:20"),
    },
    {
      id: "quote-rejected-2",
      quotationNo: "",
      clientId: "client-11",
      userId: author.id,
      lines: [quoteLine("quote-rejected-2-line", "product-2", 400, 8900)],
      requestedDueDate: day(8),
      estimatedDueDate: day(8),
      validUntil: day(13),
      status: "REJECTED",
      vatIncluded: false,
      plannedStartDate: day(5),
      plannedEndDate: day(6),
      createdAt: stamp(day(-8), "10:00"),
      updatedAt: stamp(day(-7), "15:00"),
    },
    {
      id: "quote-cancelled-2",
      quotationNo: "",
      clientId: "client-9",
      userId: author.id,
      lines: [quoteLine("quote-cancelled-2-line", "product-3", 220, 7200)],
      requestedDueDate: day(9),
      estimatedDueDate: day(9),
      validUntil: day(12),
      status: "CANCELLED",
      vatIncluded: false,
      plannedStartDate: day(6),
      plannedEndDate: day(7),
      createdAt: stamp(day(-7), "09:00"),
      updatedAt: stamp(day(-6), "18:00"),
    },
    {
      id: "quote-expired-2",
      quotationNo: "",
      clientId: "client-12",
      userId: author.id,
      lines: [quoteLine("quote-expired-2-line", "product-8", 160, 6400)],
      requestedDueDate: day(4),
      estimatedDueDate: day(4),
      validUntil: day(-2),
      status: "EXPIRED",
      vatIncluded: false,
      plannedStartDate: day(2),
      plannedEndDate: day(2),
      createdAt: stamp(day(-15), "11:00"),
      updatedAt: stamp(day(-2), "00:05"),
    },
  ];
  return [...linked, ...extras]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((quote, index) => ({ ...quote, quotationNo: `QT-${year}-${String(index + 1).padStart(3, "0")}` }))
    .reverse();
}

function sampleQuotations(clients: Client[], products: Product[], author: { id: string; name: string }, day: (offset: number) => string): Quotation[] {
  const client = clients[0];
  const product = products[0];
  if (!client || !product) return [];
  const created = stamp(day(-2), "10:00");
  return [{
    id: "quote-sent",
    quotationNo: `QT-${day(0).slice(0, 4)}-001`,
    clientId: client.id,
    userId: author.id,
    lines: [quoteLine("quote-sent-line", product.id, 800, product.unitPrice)],
    requestedDueDate: day(7),
    estimatedDueDate: day(7),
    validUntil: day(12),
    status: "SENT",
    vatIncluded: false,
    plannedStartDate: day(4),
    plannedEndDate: day(5),
    createdAt: created,
    updatedAt: created,
  }];
}

function repair(db: Database): boolean {
  let changed = false;
  db.orders.forEach((order) => {
    if ((order.status as string) === "PACKED") {
      order.status = "READY_TO_SHIP";
      changed = true;
    }
  });
  db.histories.forEach((item) => {
    if (item.fromStatus === "PACKED") {
      item.fromStatus = "READY_TO_SHIP";
      changed = true;
    }
    if (item.toStatus === "PACKED") {
      item.toStatus = "READY_TO_SHIP";
      changed = true;
    }
  });
  if (!Array.isArray(db.lineCapacityLogs)) {
    db.lineCapacityLogs = [];
    changed = true;
  }
  const sampleLineNames: Record<string, string> = { "line-1": "1라인", "line-2": "2라인", "line-3": "3라인" };
  const extraLineIds = new Set(["line-4", "line-5", "line-6", "line-7", "line-8", "line-9", "line-10"]);
  if (db.lines.some((line) => sampleLineNames[line.id] !== undefined && line.name !== sampleLineNames[line.id]) || db.lines.some((line) => extraLineIds.has(line.id))) {
    db.lines.forEach((line) => {
      const nextName = sampleLineNames[line.id];
      if (nextName && line.name !== nextName) line.name = nextName;
    });
    db.lines = db.lines.filter((line) => !extraLineIds.has(line.id));
    const kept = new Set(db.lines.map((line) => line.id));
    const fallback = db.lines.find((line) => line.status === "AVAILABLE")?.id ?? db.lines[0]?.id ?? null;
    db.workOrders.forEach((workOrder) => {
      if (!workOrder.lineId || kept.has(workOrder.lineId)) return;
      workOrder.lineId = workOrder.status === "READY" || workOrder.status === "CANCELLED" ? null : fallback;
    });
    db.lineCapacityLogs = db.lineCapacityLogs.filter((log) => kept.has(log.lineId));
    changed = true;
  }
  db.users.forEach((user) => {
    if (!["floor1", "floor2", "floor3", "floor4"].includes(user.loginId) || user.department === "생산팀") return;
    user.department = "생산팀";
    changed = true;
  });
  if (!Array.isArray(db.quotations)) {
    const author = db.users.find((user) => user.role === "ORDER_MANAGER") ?? db.users[0];
    const holidays = db.holidays.map((holiday) => holiday.date);
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
    db.quotations = author ? sampleQuotations(db.clients, db.products, author, day) : [];
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
    if (order.depositDueDate) return;
    order.depositDueDate = order.plannedStartDate >= todayISO() ? order.plannedStartDate : todayISO();
    changed = true;
  });
  db.orders.forEach((order) => {
    const legacyLines = order.lines as Array<OrderLine & { vatIncluded?: boolean }>;
    if (order.vatIncluded === undefined) {
      order.vatIncluded = legacyLines.length > 0 && legacyLines.every((line) => line.vatIncluded === true);
      changed = true;
    }
    if (order.confirmationStatus === undefined) {
      order.confirmationStatus = order.status === "CANCELLED" ? "CANCELLED" : order.status === "WAITING" ? "PENDING" : "CONFIRMED";
      changed = true;
    }
    legacyLines.forEach((line) => {
      if (!("vatIncluded" in line)) return;
      delete line.vatIncluded;
      changed = true;
    });
  });
  db.quotations.forEach((quote) => {
    const legacy = quote as Quotation & { plans?: Array<{ status?: string; plannedStartDate?: string; plannedEndDate?: string }> };
    if (!quote.plannedStartDate || !quote.plannedEndDate) {
      const active = legacy.plans?.find((plan) => plan.status === "ACTIVE") ?? legacy.plans?.[0];
      quote.plannedStartDate = active?.plannedStartDate ?? quote.estimatedDueDate;
      quote.plannedEndDate = active?.plannedEndDate ?? quote.estimatedDueDate;
      changed = true;
    }
    if (legacy.plans) {
      delete legacy.plans;
      changed = true;
    }
    quote.lines.forEach((line) => {
      const item = line as OrderLine & { vatIncluded?: boolean };
      if (!("vatIncluded" in item)) return;
      delete item.vatIncluded;
      changed = true;
    });
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
    const legacy = client as Client & { address?: string; postalCode?: string; addressDetail?: string };
    if (legacy.roadAddress === undefined && legacy.address !== undefined) {
      legacy.roadAddress = legacy.address;
      delete legacy.address;
      changed = true;
    }
    if (legacy.zipcode === undefined) {
      legacy.zipcode = legacy.postalCode ?? sampleAddresses.find((item) => item.road === legacy.roadAddress)?.zonecode ?? "";
      delete legacy.postalCode;
      changed = true;
    }
    if (legacy.detailAddress === undefined) {
      legacy.detailAddress = legacy.addressDetail ?? "";
      delete legacy.addressDetail;
      changed = true;
    }
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
  db.orders.forEach((order) => {
    const wos = db.workOrders
      .filter((item) => item.orderId === order.id && item.status !== "CANCELLED")
      .sort((left, right) => left.plannedStartDate.localeCompare(right.plannedStartDate) || left.issuedAt.localeCompare(right.issuedAt) || left.id.localeCompare(right.id));
    if (wos.length === 0 || wos.every((item) => item.items?.length)) return;
    const packs = allocateProductItems(order.lines, wos.map((item) => item.quantity));
    wos.forEach((workOrder, index) => {
      workOrder.items = packs[index] ?? [];
      changed = true;
    });
  });
  const splitWorkOrders: WorkOrder[] = [];
  for (const workOrder of [...db.workOrders]) {
    const items = workOrder.items ?? [];
    if (workOrder.status === "CANCELLED" || items.length <= 1) continue;
    const pieces = divideAllocationsByProduct(workOrder.allocations ?? [], items);
    const [first, ...rest] = pieces;
    if (!first) continue;
    const status = workOrder.status;
    const running = status === "IN_PRODUCTION" || status === "PAUSED";
    workOrder.quantity = first.quantity;
    workOrder.items = [{ productId: first.productId, quantity: first.quantity }];
    workOrder.allocations = first.allocations;
    workOrder.plannedStartDate = first.allocations[0]?.date ?? workOrder.plannedStartDate;
    workOrder.plannedEndDate = first.allocations.at(-1)?.date ?? workOrder.plannedEndDate;
    rest.forEach((piece) => {
      splitWorkOrders.push({
        id: crypto.randomUUID(),
        orderId: workOrder.orderId,
        status: running ? "READY" : status,
        assigneeId: workOrder.assigneeId,
        lineId: workOrder.lineId,
        quantity: piece.quantity,
        items: [{ productId: piece.productId, quantity: piece.quantity }],
        allocations: piece.allocations,
        issuedAt: workOrder.issuedAt,
        plannedStartDate: piece.allocations[0]?.date ?? workOrder.plannedStartDate,
        plannedEndDate: piece.allocations.at(-1)?.date ?? workOrder.plannedEndDate,
        startedAt: running ? null : workOrder.startedAt,
        completedAt: status === "COMPLETED" ? workOrder.completedAt : null,
      });
    });
    changed = true;
  }
  db.workOrders.push(...splitWorkOrders);
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
  const issued = db.products.map((product) => product.modelCode).filter((code) => code);
  db.products.forEach((product) => {
    if (product.modelCode) return;
    product.modelCode = nextModelCode(issued);
    issued.push(product.modelCode);
    changed = true;
  });
  return changed;
}

function expireSentQuotations(db: Database): boolean {
  const today = todayISO();
  let changed = false;
  const now = new Date().toISOString();
  db.quotations.forEach((quote) => {
    if (quote.status !== "SENT" || quote.validUntil.slice(0, 10) >= today) return;
    quote.status = "EXPIRED";
    quote.updatedAt = now;
    changed = true;
  });
  return changed;
}

export function readDb(): Database {
  if (!memory) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memory = JSON.parse(raw) as Database;
      if (repair(memory)) localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } else {
      memory = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    }
  }
  if (expireSentQuotations(memory)) localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
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
