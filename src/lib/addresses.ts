export interface SampleAddress {
  zonecode: string;
  road: string;
  jibun: string;
}

export const sampleAddresses: SampleAddress[] = [
  { zonecode: "08507", road: "서울특별시 금천구 가산디지털1로 168", jibun: "서울특별시 금천구 가산동 371-50" },
  { zonecode: "18478", road: "경기도 화성시 동탄기흥로 560", jibun: "경기도 화성시 반송동 93-8" },
  { zonecode: "22853", road: "인천광역시 서구 북항로 32", jibun: "인천광역시 서구 원창동 390-1" },
  { zonecode: "46757", road: "부산광역시 강서구 녹산산단382로 14", jibun: "부산광역시 강서구 송정동 1730-2" },
  { zonecode: "42713", road: "대구광역시 달서구 성서공단로11길 22", jibun: "대구광역시 달서구 호림동 9-5" },
];
