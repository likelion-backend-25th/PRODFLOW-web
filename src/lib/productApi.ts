import { apiClient } from "@/lib/apiClient.ts";
import type { ProductStatus } from "@/types/domain.ts";

export interface ProductItem {
  id: number;
  modelCode: string;
  productName: string;
  deviceName: string;
  productDescription: string;
  currentPrice: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCode {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
}

export interface ProductDrawing {
  id: number;
  fileName: string;
  createdAt: string;
}

export function listProducts(status?: ProductStatus): Promise<ProductItem[]> {
  return apiClient.get<ProductItem[]>("/products", { params: { status } }).then((response) => response.data);
}

export function searchProducts(keyword: string, status?: ProductStatus): Promise<ProductItem[]> {
  return apiClient.get<ProductItem[]>("/products/search", { params: { keyword: keyword || undefined, status } }).then((response) => response.data);
}

export function getProduct(id: number): Promise<ProductItem> {
  return apiClient.get<ProductItem>(`/products/${id}`).then((response) => response.data);
}

export function createProduct(input: {
  modelCode: string;
  productName: string;
  deviceCode?: number;
  deviceName?: string;
  productDescription: string;
  currentPrice: number;
}): Promise<ProductItem> {
  return apiClient.post<ProductItem>("/products", input).then((response) => response.data);
}

export function updateProduct(id: number, input: {
  productName: string;
  deviceCode: number;
  productDescription: string;
  currentPrice: number;
}): Promise<ProductItem> {
  return apiClient.put<ProductItem>(`/products/${id}`, input).then((response) => response.data);
}

export function updateProductStatus(id: number, status: ProductStatus): Promise<ProductItem> {
  return apiClient.patch<ProductItem>(`/products/${id}/status`, { status }).then((response) => response.data);
}

export function checkModelCode(modelCode: string): Promise<{ modelCode: string; available: boolean }> {
  return apiClient.get<{ modelCode: string; available: boolean }>("/products/model-code/exists", { params: { modelCode } }).then((response) => response.data);
}

export function listDevices(): Promise<DeviceCode[]> {
  return apiClient.get<DeviceCode[]>("/common-codes", { params: { groupCode: "DEVICE" } }).then((response) => response.data);
}

export interface ProductOrderHistory {
  orderId: number;
  orderNo: string;
  clientName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  totalAmount: number;
  estimatedDueDate: string;
  statusCode: string;
  statusName: string;
}

export function listProductOrders(productId: number, size = 3): Promise<ProductOrderHistory[]> {
  return apiClient.get<ProductOrderHistory[]>(`/products/${productId}/orders`, { params: { size } }).then((response) => response.data);
}

export function listCurrentDrawings(productId: number): Promise<ProductDrawing[]> {
  return apiClient.get<ProductDrawing[]>(`/products/${productId}/drawings/current`).then((response) => response.data);
}

export function uploadDrawing(productId: number, file: File): Promise<ProductDrawing> {
  const body = new FormData();
  body.append("file", file);
  return apiClient.post<ProductDrawing>(`/products/${productId}/drawings`, body).then((response) => response.data);
}
