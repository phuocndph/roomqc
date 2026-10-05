// Danh sách ngân hàng Việt Nam hỗ trợ VietQR
export const VIETNAM_BANKS = [
  { code: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong (TPBank)', shortName: 'TPBank' },
  { code: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại Thương (Vietcombank)', shortName: 'Vietcombank' },
  { code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển (BIDV)', shortName: 'BIDV' },
  { code: 'VietinBank', name: 'Ngân hàng TMCP Công Thương (VietinBank)', shortName: 'VietinBank' },
  { code: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn', shortName: 'Agribank' },
  { code: 'Techcombank', name: 'Ngân hàng TMCP Kỹ Thương (Techcombank)', shortName: 'Techcombank' },
  { code: 'MBBank', name: 'Ngân hàng TMCP Quân Đội (MB Bank)', shortName: 'MB Bank' },
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)', shortName: 'ACB' },
  { code: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', shortName: 'VPBank' },
  { code: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', shortName: 'Sacombank' },
  { code: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', shortName: 'HDBank' },
  { code: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)', shortName: 'SHB' },
  { code: 'OCB', name: 'Ngân hàng TMCP Phương Đông (OCB)', shortName: 'OCB' },
  { code: 'MSB', name: 'Ngân hàng TMCP Hàng Hải (MSB)', shortName: 'MSB' },
  { code: 'VIB', name: 'Ngân hàng TMCP Quốc Tế (VIB)', shortName: 'VIB' },
  { code: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á (SeABank)', shortName: 'SeABank' },
  { code: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập Khẩu (Eximbank)', shortName: 'Eximbank' },
  { code: 'LienVietPostBank', name: 'Ngân hàng TMCP Bưu điện Liên Việt', shortName: 'LienVietPostBank' },
  { code: 'SCB', name: 'Ngân hàng TMCP Sài Gòn (SCB)', shortName: 'SCB' },
  { code: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam (PVcomBank)', shortName: 'PVcomBank' },
  { code: 'BacABank', name: 'Ngân hàng TMCP Bắc Á (Bac A Bank)', shortName: 'Bac A Bank' },
  { code: 'VietABank', name: 'Ngân hàng TMCP Việt Á (VietABank)', shortName: 'VietABank' },
  { code: 'NamABank', name: 'Ngân hàng TMCP Nam Á (Nam A Bank)', shortName: 'Nam A Bank' },
  { code: 'SaigonBank', name: 'Ngân hàng TMCP Sài Gòn Công Thương (SaigonBank)', shortName: 'SaigonBank' },
  { code: 'ABBank', name: 'Ngân hàng TMCP An Bình (ABBank)', shortName: 'ABBank' },
  { code: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt (BaoVietBank)', shortName: 'BaoVietBank' },
  { code: 'NCB', name: 'Ngân hàng TMCP Quốc Dân (NCB)', shortName: 'NCB' },
  { code: 'KienLongBank', name: 'Ngân hàng TMCP Kiên Long (KienLongBank)', shortName: 'KienLongBank' },
  { code: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín (VietBank)', shortName: 'VietBank' },
  { code: 'GPBank', name: 'Ngân hàng TMCP Dầu khí Toàn Cầu (GPBank)', shortName: 'GPBank' },
  { code: 'CBBank', name: 'Ngân hàng TMCP Xây dựng (CBBank)', shortName: 'CBBank' },
  { code: 'PGBank', name: 'Ngân hàng TMCP Xăng Dầu Petrolimex (PGBank)', shortName: 'PGBank' },
  { code: 'VRB', name: 'Ngân hàng Liên doanh Việt - Nga (VRB)', shortName: 'VRB' },
  { code: 'Cake', name: 'Ngân hàng số Cake by VPBank', shortName: 'Cake' },
  { code: 'Ubank', name: 'Ngân hàng số Ubank by VPBank', shortName: 'Ubank' },
  { code: 'Timo', name: 'Ngân hàng số Timo by Bản Việt', shortName: 'Timo' },
] as const;

export type BankCode = (typeof VIETNAM_BANKS)[number]['code'];

export function getBankByCode(code: string) {
  return VIETNAM_BANKS.find(bank => bank.code === code);
}

export function getBankName(code: string): string {
  const bank = getBankByCode(code);
  return bank?.shortName || code;
}
